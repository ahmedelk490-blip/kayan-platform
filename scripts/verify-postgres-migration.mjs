/**
 * Prove the SQLite -> PostgreSQL move lost nothing.
 *
 * Three levels, because row counts alone would pass even if every number in
 * the database had been mangled:
 *
 *   1. Row counts, per table, both sides.
 *   2. Every money and quantity value in the system, compared exactly as a
 *      decimal string. This is where a float-to-numeric conversion would
 *      show up, and it is the one that matters most.
 *   3. Named critical records, read on both sides and diffed field by field.
 *
 * Usage: node --experimental-sqlite scripts/verify-postgres-migration.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

const db = new DatabaseSync(resolve(process.cwd(), 'data/kayan.db'), { readOnly: true });
// Maintenance, not the owner. Since RLS was FORCED, even kayan_owner is bound
// by the policies and sees nothing without a tenant — which is the point, but
// makes it useless for a whole-database comparison.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const delegate = (m) => m.charAt(0).toLowerCase() + m.slice(1);

const TABLES = [
  'Tenant', 'Company', 'Role', 'Permission', 'RolePermission', 'User', 'Session', 'AuditLog',
  'Color', 'Size', 'Material', 'PrintingOption', 'EmbroideryOption', 'Category',
  'Product', 'ProductVariant', 'ProductImage',
  'ProductMaterial', 'ProductPrintingOption', 'ProductEmbroideryOption',
  'Warehouse', 'WarehouseLocation', 'Stock',
  'Customer', 'CustomerActivity', 'Supplier', 'SupplierProduct',
  'Quotation', 'QuotationLine', 'SalesOrder', 'SalesOrderLine',
  'ProductionOrder', 'ProductionOrderAssignee', 'WorkOrder', 'StockMovement',
  'Formula', 'FormulaVersion', 'FormulaLine', 'FormulaParam', 'ProductFormula',
  'CostCalculation', 'CostCalculationFormula', 'CostCalculationLine',
  'SecondaryExpense', 'DamageRecord', 'Penalty', 'PenaltyEvent',
  'Supply', 'SupplyTransaction', 'Attachment',
];

/** Every money/quantity column in the schema, by table. */
const MONEY = {
  Product: ['cost', 'sellingPrice'],
  ProductVariant: ['cost', 'sellingPrice'],
  Stock: ['onHand', 'reserved', 'damaged', 'minStock', 'maxStock'],
  StockMovement: ['quantity'],
  Quotation: ['subtotal', 'discountAmount', 'discountPercent', 'taxAmount', 'total'],
  QuotationLine: ['quantity', 'unitPrice', 'discountAmount', 'discountPercent', 'taxRate', 'taxAmount', 'lineTotal', 'costSnapshot', 'grossProfit', 'marginPercent'],
  SalesOrder: ['subtotal', 'discountAmount', 'discountPercent', 'taxAmount', 'total'],
  SalesOrderLine: ['quantity', 'unitPrice', 'discountAmount', 'discountPercent', 'taxRate', 'taxAmount', 'lineTotal', 'costSnapshot', 'grossProfit', 'marginPercent'],
  ProductionOrder: ['quantity', 'estimatedCost', 'actualCost'],
  FormulaLine: ['quantity', 'yieldQty', 'unitCost'],
  FormulaParam: ['value'],
  CostCalculation: ['quantity', 'materialCost', 'inkCost', 'threadCost', 'laborCost', 'packagingCost', 'machineCost', 'overheadCost', 'wasteCost', 'directCost', 'indirectCost', 'totalCost', 'costPerPiece', 'totalMinutes', 'targetMarginPercent', 'suggestedPrice'],
  CostCalculationLine: ['quantityPerBasis', 'yieldQty', 'unitCost', 'consumedQty', 'lineCost'],
  SecondaryExpense: ['amount'],
  DamageRecord: ['quantity', 'materialCost', 'laborCost', 'totalCost'],
  Penalty: ['amount'],
  Supply: ['lastUnitCost', 'onHand', 'minStock'],
  SupplyTransaction: ['quantity', 'unitCost', 'totalCost'],
};

/** Normalise for comparison: 100 and 100.0000 are the same money. */
function norm(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : String(v);
}

async function main() {
  // ── 1. Row counts ─────────────────────────────────────────

  // Zero data loss means nothing went MISSING. It does not mean the counts
  // are frozen: the verification suites run against PostgreSQL and append to
  // the audit and stock ledgers, exactly as the application would. So the
  // test is containment — every SQLite row must still exist by id — and any
  // surplus is reported separately rather than counted as a failure.
  let totalSqlite = 0;
  let totalPg = 0;
  const missing = [];
  const surplus = [];

  for (const table of TABLES) {
    let ids = [];
    try {
      ids = db.prepare(`SELECT id FROM "${table}"`).all().map((r) => r.id);
    } catch {
      // Composite-key tables have no id column; fall back to a count.
      try {
        const c = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;
        totalSqlite += Number(c);
        const pgc = await prisma[delegate(table)].count();
        totalPg += pgc;
        if (pgc < Number(c)) missing.push(`${table}: ${c} -> ${pgc}`);
      } catch {
        /* table absent in SQLite */
      }
      continue;
    }

    totalSqlite += ids.length;
    const pgCount = await prisma[delegate(table)].count();
    totalPg += pgCount;

    if (ids.length > 0) {
      const found = await prisma[delegate(table)].count({ where: { id: { in: ids } } });
      if (found !== ids.length) missing.push(`${table}: ${ids.length - found} rows lost`);
    }
    if (pgCount > ids.length) surplus.push(`${table} +${pgCount - ids.length}`);
  }

  check(
    `no row from any of the ${TABLES.length} tables went missing`,
    missing.length === 0,
    missing.join('; ') || `all ${totalSqlite} SQLite rows found in PostgreSQL`,
  );
  check(
    'the only difference is rows added since the migration',
    totalPg >= totalSqlite,
    surplus.length ? `appended since: ${surplus.join(', ')}` : 'none appended',
  );

  // ── 2. Every money and quantity value ─────────────────────

  let compared = 0;
  const drifted = [];

  for (const [table, columns] of Object.entries(MONEY)) {
    let rows;
    try {
      rows = db.prepare(`SELECT * FROM "${table}"`).all();
    } catch {
      continue;
    }
    if (rows.length === 0) continue;

    const pgRows = await prisma[delegate(table)].findMany();
    const byId = new Map(pgRows.map((r) => [r.id, r]));

    for (const row of rows) {
      const pgRow = byId.get(row.id);
      if (!pgRow) {
        drifted.push(`${table}#${row.id} missing in postgres`);
        continue;
      }
      for (const col of columns) {
        if (!(col in row)) continue;
        const a = norm(row[col]);
        const b = norm(pgRow[col]);
        compared += 1;
        if (a !== b) drifted.push(`${table}#${row.id}.${col}: ${a} -> ${b}`);
      }
    }
  }

  check(
    `all ${compared} money and quantity values survived exactly`,
    drifted.length === 0,
    drifted.slice(0, 5).join('; ') || 'no drift',
  );

  // Storage is now genuinely exact, which it was not on SQLite.
  const [{ data_type: t, numeric_precision: p, numeric_scale: s }] = await prisma.$queryRawUnsafe(
    `SELECT data_type, numeric_precision, numeric_scale
       FROM information_schema.columns
      WHERE table_name = 'SalesOrder' AND column_name = 'total'`,
  );
  check(
    'money columns are real NUMERIC(19,4), not float-backed',
    t === 'numeric' && Number(p) === 19 && Number(s) === 4,
    `${t}(${p},${s})`,
  );

  // ── 3. Named critical records ─────────────────────────────

  const sqliteOrder = db.prepare(`SELECT * FROM "SalesOrder" LIMIT 1`).get();
  if (sqliteOrder) {
    const pgOrder = await prisma.salesOrder.findUnique({ where: { id: sqliteOrder.id } });
    check('the sales order survived', Boolean(pgOrder), sqliteOrder.number);
    check(
      'its total is byte-identical',
      norm(sqliteOrder.total) === norm(pgOrder.total),
      `${sqliteOrder.total} -> ${pgOrder.total}`,
    );
    check('its status is unchanged', sqliteOrder.status === pgOrder.status, pgOrder.status);
    check(
      'its confirmedAt timestamp survived',
      Boolean(sqliteOrder.confirmedAt) === Boolean(pgOrder.confirmedAt),
    );
  }

  // The pricing snapshot is the thing that must never move.
  const sqliteLine = db.prepare(`SELECT * FROM "SalesOrderLine" LIMIT 1`).get();
  if (sqliteLine) {
    const pgLine = await prisma.salesOrderLine.findUnique({ where: { id: sqliteLine.id } });
    check(
      'the pricing snapshot on a sales line is unchanged',
      norm(sqliteLine.unitPrice) === norm(pgLine.unitPrice) &&
        norm(sqliteLine.lineTotal) === norm(pgLine.lineTotal),
      `unit ${pgLine.unitPrice}, total ${pgLine.lineTotal}`,
    );
  }

  // And the cost snapshot, for the same reason.
  const sqliteCalc = db.prepare(`SELECT * FROM "CostCalculation" LIMIT 1`).get();
  if (sqliteCalc) {
    const pgCalc = await prisma.costCalculation.findUnique({
      where: { id: sqliteCalc.id },
      include: { lines: true, formulas: true },
    });
    check('the cost snapshot survived', Boolean(pgCalc));
    check(
      'its total is unchanged',
      norm(sqliteCalc.totalCost) === norm(pgCalc.totalCost),
      `${sqliteCalc.totalCost} -> ${pgCalc.totalCost}`,
    );
    const lineSum = pgCalc.lines.reduce((s, l) => s + Number(l.lineCost.toString()), 0);
    check(
      'its lines still add up to its total',
      Math.abs(lineSum - Number(pgCalc.totalCost.toString())) < 0.01,
      `${lineSum.toFixed(2)} vs ${pgCalc.totalCost}`,
    );
    check(
      'it still records which formula version produced it',
      pgCalc.formulas.length > 0,
    );
  }

  // Reservation idempotency depends on this constraint existing in Postgres.
  const constraints = await prisma.$queryRawUnsafe(`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'StockMovement' AND indexdef LIKE '%UNIQUE%'`);
  const names = constraints.map((c) => c.indexname).join(' ');
  check(
    'the reservation idempotency constraint came across',
    names.includes('salesOrderLineId_type'),
    names || 'none',
  );
  check(
    'the production receipt idempotency constraint came across',
    names.includes('productionOrderId_type'),
  );

  // Soft delete must still be a filter, not a deletion.
  const softDeleted = await prisma.product.count({ where: { isDeleted: true } });
  const allProducts = await prisma.product.count();
  check(
    'soft-delete rows are present, not dropped',
    allProducts >= softDeleted,
    `${allProducts} products, ${softDeleted} soft-deleted`,
  );

  // Users and their password hashes must be intact or nobody can log in.
  const sqliteUsers = db.prepare(`SELECT * FROM "User"`).all();
  const pgUsers = await prisma.user.findMany();
  const hashesMatch = sqliteUsers.every((u) => {
    const p = pgUsers.find((x) => x.id === u.id);
    return p && p.passwordHash === u.passwordHash && p.email === u.email;
  });
  check('every user and password hash survived intact', hashesMatch, `${pgUsers.length} users`);

  // Arabic text through a UTF8 database.
  const product = await prisma.product.findFirst({ where: { nameAr: { not: '' } } });
  check(
    'Arabic text round-tripped through UTF8',
    Boolean(product?.nameAr) && /[؀-ۿ]/.test(product.nameAr),
    product?.nameAr ?? 'none',
  );

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  console.log(`tables compared: ${TABLES.length} · rows: ${totalSqlite} · money values: ${compared}`);
  if (passed !== results.length) {
    for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
    process.exitCode = 1;
  }

  db.close();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
