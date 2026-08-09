/**
 * Generate the Row-Level Security migration.
 *
 * Written by a generator rather than by hand because it is 50 tables of
 * near-identical SQL, and a typo in one policy is a silent tenant leak that
 * no test would necessarily catch.
 *
 * Three categories:
 *
 *   OWNED     the table carries tenantId. The policy compares it directly.
 *   CHILD     the table has no tenantId and reaches one through a parent.
 *             The policy is an EXISTS against that parent. Without these a
 *             caller who guessed a child row's id could read it directly,
 *             which is exactly the hole the repository layer was papering
 *             over before.
 *   GLOBAL    genuinely shared reference data. RLS stays off, deliberately
 *             and with a reason recorded next to each one.
 *
 * The tenant comes from current_setting('app.tenant_id', true). The `true`
 * means "return NULL if unset" rather than raising, and NULL never equals
 * anything — so a connection that forgets to set the tenant sees nothing at
 * all. Deny by default (NFR-12), enforced by the database.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const OWNED = [
  'AuditLog', 'Category', 'Color', 'Company', 'CostCalculation', 'Customer',
  'DamageRecord', 'EmbroideryOption', 'Formula', 'Material', 'Penalty',
  'PrintingOption', 'Product', 'ProductionOrder', 'Quotation', 'SalesOrder',
  'SecondaryExpense', 'Size', 'StockMovement', 'Supplier', 'Supply',
  'SupplyTransaction', 'User', 'Warehouse',
  // Phase 9
  'PurchaseOrder', 'GoodsReceipt',
  // Phase 10. DocumentSequence is tenant-scoped too: one tenant must never
  // be able to read, still less advance, another tenant's invoice counter.
  'Invoice', 'Payment', 'DocumentSequence',
];

/**
 * Child tables and the predicate that reaches a tenant.
 * `t` is the row being tested.
 */
const CHILD = {
  ProductVariant: `EXISTS (SELECT 1 FROM "Product" p WHERE p.id = t."productId" AND p."tenantId" = app_tenant())`,
  ProductImage: `EXISTS (SELECT 1 FROM "Product" p WHERE p.id = t."productId" AND p."tenantId" = app_tenant())`,
  ProductMaterial: `EXISTS (SELECT 1 FROM "Product" p WHERE p.id = t."productId" AND p."tenantId" = app_tenant())`,
  ProductPrintingOption: `EXISTS (SELECT 1 FROM "Product" p WHERE p.id = t."productId" AND p."tenantId" = app_tenant())`,
  ProductEmbroideryOption: `EXISTS (SELECT 1 FROM "Product" p WHERE p.id = t."productId" AND p."tenantId" = app_tenant())`,
  ProductFormula: `EXISTS (SELECT 1 FROM "Product" p WHERE p.id = t."productId" AND p."tenantId" = app_tenant())`,

  WarehouseLocation: `EXISTS (SELECT 1 FROM "Warehouse" w WHERE w.id = t."warehouseId" AND w."tenantId" = app_tenant())`,
  Stock: `EXISTS (SELECT 1 FROM "Warehouse" w WHERE w.id = t."warehouseId" AND w."tenantId" = app_tenant())`,

  CustomerActivity: `EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = t."customerId" AND c."tenantId" = app_tenant())`,
  SupplierProduct: `EXISTS (SELECT 1 FROM "Supplier" s WHERE s.id = t."supplierId" AND s."tenantId" = app_tenant())`,

  QuotationLine: `EXISTS (SELECT 1 FROM "Quotation" q WHERE q.id = t."quotationId" AND q."tenantId" = app_tenant())`,
  SalesOrderLine: `EXISTS (SELECT 1 FROM "SalesOrder" o WHERE o.id = t."salesOrderId" AND o."tenantId" = app_tenant())`,

  ProductionOrderAssignee: `EXISTS (SELECT 1 FROM "ProductionOrder" o WHERE o.id = t."productionOrderId" AND o."tenantId" = app_tenant())`,
  WorkOrder: `EXISTS (SELECT 1 FROM "ProductionOrder" o WHERE o.id = t."productionOrderId" AND o."tenantId" = app_tenant())`,

  FormulaVersion: `EXISTS (SELECT 1 FROM "Formula" f WHERE f.id = t."formulaId" AND f."tenantId" = app_tenant())`,
  // Two hops: line -> version -> formula.
  FormulaLine: `EXISTS (SELECT 1 FROM "FormulaVersion" v JOIN "Formula" f ON f.id = v."formulaId" WHERE v.id = t."formulaVersionId" AND f."tenantId" = app_tenant())`,
  FormulaParam: `EXISTS (SELECT 1 FROM "FormulaVersion" v JOIN "Formula" f ON f.id = v."formulaId" WHERE v.id = t."formulaVersionId" AND f."tenantId" = app_tenant())`,

  CostCalculationFormula: `EXISTS (SELECT 1 FROM "CostCalculation" c WHERE c.id = t."costCalculationId" AND c."tenantId" = app_tenant())`,
  CostCalculationLine: `EXISTS (SELECT 1 FROM "CostCalculation" c WHERE c.id = t."costCalculationId" AND c."tenantId" = app_tenant())`,

  PenaltyEvent: `EXISTS (SELECT 1 FROM "Penalty" p WHERE p.id = t."penaltyId" AND p."tenantId" = app_tenant())`,

  Session: `EXISTS (SELECT 1 FROM "User" u WHERE u.id = t."userId" AND u."tenantId" = app_tenant())`,

  // Phase 9
  PurchaseOrderLine: `EXISTS (SELECT 1 FROM "PurchaseOrder" p WHERE p.id = t."purchaseOrderId" AND p."tenantId" = app_tenant())`,
  GoodsReceiptLine: `EXISTS (SELECT 1 FROM "GoodsReceipt" g WHERE g.id = t."goodsReceiptId" AND g."tenantId" = app_tenant())`,

  // Phase 10
  InvoiceLine: `EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id = t."invoiceId" AND i."tenantId" = app_tenant())`,

  // Attachment hangs off any one of six owners, exactly one of which is set.
  Attachment: `(
       EXISTS (SELECT 1 FROM "Customer" c         WHERE c.id = t."customerId"   AND c."tenantId" = app_tenant())
    OR EXISTS (SELECT 1 FROM "Supplier" s         WHERE s.id = t."supplierId"   AND s."tenantId" = app_tenant())
    OR EXISTS (SELECT 1 FROM "Quotation" q        WHERE q.id = t."quotationId"  AND q."tenantId" = app_tenant())
    OR EXISTS (SELECT 1 FROM "SalesOrder" o       WHERE o.id = t."salesOrderId" AND o."tenantId" = app_tenant())
    OR EXISTS (SELECT 1 FROM "SecondaryExpense" e WHERE e.id = t."expenseId"    AND e."tenantId" = app_tenant())
    OR EXISTS (SELECT 1 FROM "DamageRecord" d     WHERE d.id = t."damageId"     AND d."tenantId" = app_tenant())
  )`,
};

/** RLS deliberately off, with the reason recorded. */
const GLOBAL = {
  Role: 'the role catalogue is identical for every tenant',
  Permission: 'the permission catalogue is identical for every tenant',
  RolePermission: 'the permission matrix is global configuration, seeded from code',
  _prisma_migrations: 'migration history, owner-only; the app role is never granted it',
};

const lines = [];
const w = (s = '') => lines.push(s);

w(`-- Phase 7 — Row-Level Security.`);
w(`--`);
w(`-- Generated by scripts/generate-rls.mjs. Edit the generator, not this file.`);
w(`--`);
w(`-- ADR-002 required tenant isolation in the database rather than in the`);
w(`-- repository layer. This is that. Every policy below denies by default:`);
w(`-- app_tenant() returns NULL when the connection has not declared a tenant,`);
w(`-- and NULL never equals anything, so an un-scoped connection reads nothing.`);
w();

w(`-- The tenant of the current connection. STABLE so the planner may cache it`);
w(`-- within a statement; the second argument makes a missing setting return`);
w(`-- NULL instead of raising, which is what turns "forgot to set it" into`);
w(`-- "sees nothing" rather than "crashes".`);
w(`CREATE OR REPLACE FUNCTION app_tenant() RETURNS text`);
w(`  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.tenant_id', true) $$;`);
w();
w(`REVOKE ALL ON FUNCTION app_tenant() FROM PUBLIC;`);
w(`GRANT EXECUTE ON FUNCTION app_tenant() TO kayan_app, kayan_auth, kayan_owner;`);
w();

w(`-- ── Tenant itself ────────────────────────────────────────`);
w(`ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;`);
w(`ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;`);
w(`DROP POLICY IF EXISTS tenant_isolation ON "Tenant";`);
w(`CREATE POLICY tenant_isolation ON "Tenant" AS PERMISSIVE FOR ALL TO PUBLIC`);
w(`  USING (id = app_tenant()) WITH CHECK (id = app_tenant());`);
w();

w(`-- ── Tables that carry tenantId ───────────────────────────`);
for (const table of OWNED) {
  w(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
  // FORCE matters: without it the table owner - which runs migrations and
  // seeds - would silently bypass its own policies.
  w(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
  w(`DROP POLICY IF EXISTS tenant_isolation ON "${table}";`);
  w(`CREATE POLICY tenant_isolation ON "${table}" AS PERMISSIVE FOR ALL TO PUBLIC`);
  w(`  USING ("tenantId" = app_tenant()) WITH CHECK ("tenantId" = app_tenant());`);
  w();
}

w(`-- ── Child tables, isolated through their parent ──────────`);
for (const [table, predicate] of Object.entries(CHILD)) {
  w(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
  w(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
  w(`DROP POLICY IF EXISTS tenant_isolation ON "${table}";`);
  w(`CREATE POLICY tenant_isolation ON "${table}" AS PERMISSIVE FOR ALL TO PUBLIC`);
  w(`  USING (${predicate.replace(/\bt\./g, `"${table}".`)})`);
  w(`  WITH CHECK (${predicate.replace(/\bt\./g, `"${table}".`)});`);
  w();
}

w(`-- ── Deliberately global (no RLS) ─────────────────────────`);
for (const [table, why] of Object.entries(GLOBAL)) {
  w(`-- ${table}: ${why}`);
}
w();

w(`-- ── Privileges ───────────────────────────────────────────`);
w(`-- The application role owns nothing and may not create anything. Its`);
w(`-- entire visibility is decided by the policies above.`);
w(`GRANT USAGE ON SCHEMA public TO kayan_app, kayan_auth;`);
w(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kayan_app, kayan_auth;`);
w(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kayan_app, kayan_auth;`);
w(`ALTER DEFAULT PRIVILEGES IN SCHEMA public`);
w(`  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kayan_app, kayan_auth;`);
w();
w(`-- Migration history is owner business only.`);
w(`REVOKE ALL ON TABLE "_prisma_migrations" FROM kayan_app, kayan_auth;`);
w();

/**
 * The output migration. Every statement is idempotent — ENABLE is a no-op
 * when already enabled, and each policy is dropped before being created — so
 * regenerating the whole file into a later migration is safe and keeps the
 * policies in one reviewable place rather than scattered across phases.
 */
const dir = process.argv[2] ?? 'prisma/migrations/20260809180000_row_level_security';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/migration.sql`, lines.join('\n'), 'utf8');

console.log(`wrote ${dir}/migration.sql`);
console.log(`  owned tables : ${OWNED.length}`);
console.log(`  child tables : ${Object.keys(CHILD).length}`);
console.log(`  global tables: ${Object.keys(GLOBAL).length}`);
console.log(`  total with RLS: ${OWNED.length + Object.keys(CHILD).length + 1}`);
