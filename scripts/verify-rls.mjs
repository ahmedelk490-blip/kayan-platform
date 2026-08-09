/**
 * Row-Level Security isolation test.
 *
 * This is the test that decides whether Phase 7 actually delivered anything.
 * It does not check that policies exist — it tries to break out of them, as
 * the application role, using the exact mechanism the application uses.
 *
 * A second tenant is created, given its own product and variant, and then the
 * first tenant attempts to read it, read it by primary key, update it, and
 * forge a row into it. Every one of those must fail.
 *
 * Usage: node scripts/verify-rls.mjs
 */
import { PrismaClient } from '@prisma/client';

/** The application role: no ownership, no BYPASSRLS. */
const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
/** Superuser, for setting up and tearing down the second tenant. */
const admin = new PrismaClient({ datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } } });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Run a query as the application role with a declared tenant.
 *
 * Identical to what lib/prisma.ts does at runtime: one transaction, the
 * setting scoped to it, so a pooled connection cannot carry a tenant over to
 * the next request.
 */
async function asTenant(tenantId, fn) {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

/** Run with no tenant declared at all. */
async function asNobody(fn) {
  return app.$transaction(async (tx) => fn(tx));
}

const RIVAL = 'rival-tenant-rls-test';

async function main() {
  // ── Setup: a second tenant with data of its own ───────────

  await admin.tenant.upsert({
    where: { id: RIVAL },
    update: {},
    create: { id: RIVAL, name: 'Rival Factory' },
  });

  const category = await admin.category.upsert({
    where: { id: `${RIVAL}-cat` },
    update: {},
    create: {
      id: `${RIVAL}-cat`,
      tenantId: RIVAL,
      nameAr: 'تصنيف منافس',
      nameEn: 'Rival Category',
      slug: 'rival-cat',
    },
  });

  const rivalProduct = await admin.product.upsert({
    where: { id: `${RIVAL}-product` },
    update: {},
    create: {
      id: `${RIVAL}-product`,
      tenantId: RIVAL,
      categoryId: category.id,
      sku: 'RIVAL-SECRET-001',
      nameAr: 'منتج سري للمنافس',
      sellingPrice: '999.9900',
      variants: { create: { id: `${RIVAL}-variant`, sku: 'RIVAL-SECRET-001-DEF' } },
    },
    include: { variants: true },
  });

  const kayanProduct = await admin.product.findFirst({ where: { tenantId: 'kayan' } });
  check('fixtures exist: two tenants with products', Boolean(kayanProduct && rivalProduct));

  // ── 1. No tenant declared = nothing visible ───────────────

  const blind = await asNobody((tx) => tx.product.count());
  check(
    'a connection that declares no tenant sees zero rows',
    blind === 0,
    `${blind} products visible`,
  );

  const blindCustomers = await asNobody((tx) => tx.customer.count());
  const blindOrders = await asNobody((tx) => tx.salesOrder.count());
  check(
    'the same holds for customers and sales orders',
    blindCustomers === 0 && blindOrders === 0,
    `${blindCustomers} customers, ${blindOrders} orders`,
  );

  // ── 2. A declared tenant sees its own, and only its own ───

  const kayanCount = await asTenant('kayan', (tx) => tx.product.count());
  const rivalCount = await asTenant(RIVAL, (tx) => tx.product.count());
  const adminCount = await admin.product.count();
  check('kayan sees its own products', kayanCount > 0, `${kayanCount}`);
  check('rival sees exactly its one product', rivalCount === 1, `${rivalCount}`);
  check(
    'neither sees the whole table',
    kayanCount + rivalCount === adminCount,
    `${kayanCount} + ${rivalCount} = ${adminCount} total`,
  );

  // ── 3. THE ATTACK: reach across with a known primary key ──

  // Guessing or leaking an id is the realistic attack. The repository layer
  // used to be the only thing standing in the way of this.
  const stolen = await asTenant('kayan', (tx) =>
    tx.product.findUnique({ where: { id: rivalProduct.id } }),
  );
  check(
    'kayan CANNOT read the rival product by its primary key',
    stolen === null,
    stolen ? `LEAKED: ${stolen.nameAr}` : 'denied',
  );

  const stolenBySku = await asTenant('kayan', (tx) =>
    tx.product.findFirst({ where: { sku: 'RIVAL-SECRET-001' } }),
  );
  check('kayan CANNOT find it by SKU either', stolenBySku === null);

  // Child table with no tenantId of its own — the case the EXISTS policies
  // exist for.
  const stolenVariant = await asTenant('kayan', (tx) =>
    tx.productVariant.findUnique({ where: { id: `${RIVAL}-variant` } }),
  );
  check(
    'kayan CANNOT read the rival variant, which has no tenantId column',
    stolenVariant === null,
    stolenVariant ? 'LEAKED' : 'denied by the parent-based policy',
  );

  // ── 4. Writes across the boundary ─────────────────────────

  const updated = await asTenant('kayan', (tx) =>
    tx.product.updateMany({
      where: { id: rivalProduct.id },
      data: { nameAr: 'تم الاختراق' },
    }),
  );
  check('kayan CANNOT update the rival product', updated.count === 0, `${updated.count} rows`);

  const stillIntact = await admin.product.findUnique({ where: { id: rivalProduct.id } });
  check('the rival product is untouched', stillIntact.nameAr === 'منتج سري للمنافس');

  const deleted = await asTenant('kayan', (tx) =>
    tx.product.deleteMany({ where: { id: rivalProduct.id } }),
  );
  check('kayan CANNOT delete the rival product', deleted.count === 0);

  // WITH CHECK: forging a row INTO another tenant must be refused.
  let forgeBlocked = false;
  let forgeError = '';
  try {
    await asTenant('kayan', (tx) =>
      tx.category.create({
        data: {
          id: `${RIVAL}-forged`,
          tenantId: RIVAL,
          nameAr: 'مزوّر',
          nameEn: 'Forged',
          slug: 'forged',
        },
      }),
    );
  } catch (error) {
    forgeBlocked = true;
    forgeError = String(error.message).split('\n').find((l) => l.includes('policy')) ?? 'refused';
  }
  check(
    'kayan CANNOT insert a row belonging to the rival tenant',
    forgeBlocked,
    forgeBlocked ? forgeError.trim().slice(0, 60) : 'FORGERY SUCCEEDED',
  );

  // ── 5. The setting cannot leak between requests ───────────

  await asTenant(RIVAL, (tx) => tx.product.count());
  const afterRival = await asNobody((tx) => tx.product.count());
  check(
    'the tenant setting does not survive onto the next pooled connection',
    afterRival === 0,
    `${afterRival} rows visible afterwards`,
  );

  // ── 6. The app role really is powerless ───────────────────

  const [{ rolsuper, rolbypassrls }] = await admin.$queryRawUnsafe(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'kayan_app'`,
  );
  check('the application role is not a superuser', rolsuper === false);
  check('the application role does not hold BYPASSRLS', rolbypassrls === false);

  const forced = await admin.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND NOT c.relforcerowsecurity`,
  );
  check(
    'every RLS table also FORCES it, so the owner cannot bypass its own policies',
    forced[0].n === 0,
    `${forced[0].n} tables enabled but not forced`,
  );

  // Derived, not a magic number: a hardcoded count goes stale the moment a
  // phase adds a table, and a stale count fails loudly for the wrong reason
  // while a genuinely unprotected table would slip past unnoticed.
  const unprotected = await admin.$queryRawUnsafe(`
    SELECT c.relname AS table
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
     ORDER BY 1`);
  const names = unprotected.map((r) => r.table);
  // The four documented globals, and nothing else, may lack RLS.
  const ALLOWED = ['Permission', 'Role', 'RolePermission', '_prisma_migrations'];
  const unexpected = names.filter((t) => !ALLOWED.includes(t));
  check(
    'no table lacks RLS except the four documented global ones',
    unexpected.length === 0,
    unexpected.length ? `UNPROTECTED: ${unexpected.join(', ')}` : names.join(', '),
  );

  // And every table that carries a tenantId must be protected, always.
  const tenantTablesUnprotected = await admin.$queryRawUnsafe(`
    SELECT c.relname AS table
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_name = c.relname AND col.column_name = 'tenantId'
     WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
  check(
    'every table carrying tenantId has RLS',
    tenantTablesUnprotected.length === 0,
    tenantTablesUnprotected.map((r) => r.table).join(', ') || 'all protected',
  );

  // ── Cleanup ───────────────────────────────────────────────

  await admin.productVariant.deleteMany({ where: { productId: rivalProduct.id } });
  await admin.product.deleteMany({ where: { tenantId: RIVAL } });
  await admin.category.deleteMany({ where: { tenantId: RIVAL } });
  await admin.tenant.deleteMany({ where: { id: RIVAL } });
  const leftover = await admin.tenant.count({ where: { id: RIVAL } });
  check('the test cleaned up after itself', leftover === 0);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await app.$disconnect();
    await admin.$disconnect();
  });
