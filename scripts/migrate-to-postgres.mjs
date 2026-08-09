/**
 * Move every row from the SQLite database into PostgreSQL.
 *
 * Reads SQLite directly through node:sqlite and writes through the Prisma
 * client, so Prisma performs the type conversions it will perform for the
 * rest of the application's life — dates into timestamps, strings into
 * NUMERIC(19,4). Writing raw SQL on both sides would test a code path the
 * application never uses.
 *
 * Order matters. PostgreSQL actually enforces the foreign keys SQLite was
 * only documenting, so parents must land before children. Anything that
 * fails to insert is a referential problem that was already latent.
 *
 * Idempotent: rows whose primary key already exists are skipped, so a partial
 * run resumes cleanly.
 *
 * Usage: node --experimental-sqlite scripts/migrate-to-postgres.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient, Prisma } from '@prisma/client';
import { resolve } from 'node:path';

const SQLITE_FILE = resolve(process.cwd(), 'data/kayan.db');

// Written as the owner: the migration is a schema-level operation, and the
// application role deliberately cannot see across tenants.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
});

/**
 * Dependency order. Parents first; StockMovement after both sales and
 * production because it references either. Attachment last — it points at
 * four different owners.
 */
const TABLES = [
  'Tenant', 'Company', 'Role', 'Permission', 'RolePermission', 'User', 'Session', 'AuditLog',
  'Color', 'Size', 'Material', 'PrintingOption', 'EmbroideryOption', 'Category',
  'Product', 'ProductVariant', 'ProductImage',
  'ProductMaterial', 'ProductPrintingOption', 'ProductEmbroideryOption',
  'Warehouse', 'WarehouseLocation', 'Stock',
  'Customer', 'CustomerActivity', 'Supplier', 'SupplierProduct',
  'Quotation', 'QuotationLine', 'SalesOrder', 'SalesOrderLine',
  'ProductionOrder', 'ProductionOrderAssignee', 'WorkOrder',
  'StockMovement',
  'Formula', 'FormulaVersion', 'FormulaLine', 'FormulaParam', 'ProductFormula',
  'CostCalculation', 'CostCalculationFormula', 'CostCalculationLine',
  'SecondaryExpense', 'DamageRecord', 'Penalty', 'PenaltyEvent',
  'Supply', 'SupplyTransaction',
  'Attachment',
];

/**
 * Columns that point forward at a row inserted later in the order.
 * Formula.currentVersionId references a FormulaVersion that does not exist
 * yet, so it is nulled on insert and set in a second pass.
 */
const DEFERRED = { Formula: ['currentVersionId'] };

/** Prisma delegate name for a model: Tenant -> tenant, AuditLog -> auditLog. */
const delegate = (model) => model.charAt(0).toLowerCase() + model.slice(1);

function fieldMap(model) {
  const meta = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  if (!meta) throw new Error(`model ${model} is not in the schema`);
  const out = new Map();
  for (const f of meta.fields) {
    if (f.kind === 'object') continue; // relations are carried by their FK
    out.set(f.name, f);
  }
  return out;
}

/**
 * SQLite has no real types. Booleans arrive as 0/1, dates as milliseconds or
 * ISO text, decimals as float or text. Each is converted to what Prisma
 * expects for the PostgreSQL column.
 */
function coerce(value, field) {
  if (value === null || value === undefined) return null;

  switch (field.type) {
    case 'Boolean':
      return value === 1 || value === true || value === '1';
    case 'DateTime': {
      if (value instanceof Date) return value;
      if (typeof value === 'number') return new Date(value);
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) throw new Error(`bad date ${value}`);
      return d;
    }
    case 'Decimal':
      // Through a string, never a float: passing the JS number would
      // reintroduce exactly the binary-float error this migration removes.
      return new Prisma.Decimal(String(value));
    case 'Int':
      return typeof value === 'bigint' ? Number(value) : value;
    case 'BigInt':
      return BigInt(value);
    default:
      return typeof value === 'bigint' ? Number(value) : value;
  }
}

async function main() {
  const db = new DatabaseSync(SQLITE_FILE, { readOnly: true });

  const summary = [];
  let totalRead = 0;
  let totalWritten = 0;
  const deferredFixups = [];

  for (const model of TABLES) {
    const fields = fieldMap(model);
    let rows;
    try {
      rows = db.prepare(`SELECT * FROM "${model}"`).all();
    } catch (error) {
      summary.push({ model, read: 0, written: 0, note: `no such table (${error.message})` });
      continue;
    }

    totalRead += rows.length;
    if (rows.length === 0) {
      summary.push({ model, read: 0, written: 0, note: 'empty' });
      continue;
    }

    const client = prisma[delegate(model)];
    const deferredCols = DEFERRED[model] ?? [];
    let written = 0;

    for (const row of rows) {
      const data = {};
      for (const [name, field] of fields) {
        if (!(name in row)) continue;
        if (deferredCols.includes(name)) {
          if (row[name] !== null) {
            deferredFixups.push({ model, id: row.id, column: name, value: row[name] });
          }
          continue;
        }
        data[name] = coerce(row[name], field);
      }

      try {
        await client.create({ data });
        written += 1;
      } catch (error) {
        // A unique-constraint collision means the row is already there from
        // an earlier run. Anything else is a genuine failure and must stop
        // the migration rather than be quietly counted as success.
        if (error?.code === 'P2002') continue;
        console.error(`\nFAILED ${model} id=${row.id}`);
        console.error(error.message.split('\n').slice(0, 4).join('\n'));
        throw error;
      }
    }

    totalWritten += written;
    summary.push({ model, read: rows.length, written });
    process.stdout.write(`${model} ${written}/${rows.length}  `);
  }

  // Second pass for the forward references.
  for (const fix of deferredFixups) {
    await prisma[delegate(fix.model)].update({
      where: { id: fix.id },
      data: { [fix.column]: fix.value },
    });
  }

  console.log('\n');
  console.table(summary.filter((s) => s.read > 0));
  console.log(`rows read from SQLite : ${totalRead}`);
  console.log(`rows written to Postgres: ${totalWritten}`);
  console.log(`forward references fixed: ${deferredFixups.length}`);

  db.close();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
