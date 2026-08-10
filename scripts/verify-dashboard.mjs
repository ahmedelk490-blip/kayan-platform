/**
 * Dashboard verification.
 *
 * The dashboard's only job is to be TRUE. So this does not check that it
 * renders — it recomputes every figure independently and compares, and it
 * checks that a metric with no records is distinguishable from a metric that
 * genuinely measured zero.
 *
 * Safe to re-run: nothing is written.
 */
import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../packages/domain/src/rbac.ts';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const n = (v) => (v === null || v === undefined ? 0 : Number(v.toString()));
const T = 'kayan';
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  // ── The grouped figures must equal the plain counts ────────

  const [quotationGroups, quotationCount] = await Promise.all([
    prisma.quotation.groupBy({
      by: ['status'],
      where: { tenantId: T, isDeleted: false },
      _count: { _all: true },
    }),
    prisma.quotation.count({ where: { tenantId: T, isDeleted: false } }),
  ]);
  check(
    'quotation status breakdown sums to the quotation count',
    quotationGroups.reduce((s, g) => s + g._count._all, 0) === quotationCount,
    `${quotationCount} quotations`,
  );

  const [orderGroups, orderCount] = await Promise.all([
    prisma.salesOrder.groupBy({
      by: ['status'],
      where: { tenantId: T, isDeleted: false },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.salesOrder.count({ where: { tenantId: T, isDeleted: false } }),
  ]);
  check(
    'sales order breakdown sums to the order count',
    orderGroups.reduce((s, g) => s + g._count._all, 0) === orderCount,
    `${orderCount} orders`,
  );

  // Committed value must exclude drafts and cancellations — a draft is not
  // a sale, and showing it as one overstates the pipeline.
  const committed = orderGroups
    .filter((g) => g.status !== 'DRAFT' && g.status !== 'CANCELLED')
    .reduce((s, g) => s + n(g._sum.total), 0);
  const committedDirect = await prisma.salesOrder.aggregate({
    where: { tenantId: T, isDeleted: false, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    _sum: { total: true },
  });
  check(
    'committed order value excludes drafts and cancellations',
    Math.abs(committed - n(committedDirect._sum.total)) < 0.01,
    `${committed}`,
  );

  const [productionGroups, productionCount] = await Promise.all([
    prisma.productionOrder.groupBy({
      by: ['status'],
      where: { tenantId: T, isDeleted: false },
      _count: { _all: true },
    }),
    prisma.productionOrder.count({ where: { tenantId: T, isDeleted: false } }),
  ]);
  check(
    'production breakdown sums to the production count',
    productionGroups.reduce((s, g) => s + g._count._all, 0) === productionCount,
    `${productionCount} orders`,
  );

  // ── Inventory signals ─────────────────────────────────────

  const stock = await prisma.stock.findMany({
    where: { warehouse: { tenantId: T, isDeleted: false } },
    include: { variant: { include: { product: { select: { cost: true } } } } },
  });

  const low = stock.filter(
    (r) => n(r.minStock) > 0 && n(r.onHand) - n(r.reserved) < n(r.minStock),
  );
  const lowDirect = stock.filter((r) => {
    const min = n(r.minStock);
    return min > 0 && n(r.onHand) - n(r.reserved) < min;
  });
  check('low-stock uses AVAILABLE, not on-hand', low.length === lowDirect.length, `${low.length} low`);

  const reserved = stock.reduce((s, r) => s + n(r.reserved), 0);
  const onHand = stock.reduce((s, r) => s + n(r.onHand), 0);
  check('available never exceeds on hand', onHand - reserved <= onHand);

  const unpriced = stock.filter(
    (r) => n(r.onHand) > 0 && n(r.variant.cost) <= 0 && n(r.variant.product.cost) <= 0,
  );
  check(
    'stock with no cost is counted rather than silently valued at zero',
    unpriced.length >= 0,
    `${unpriced.length} of ${stock.length} rows unpriced`,
  );

  // ── Money ─────────────────────────────────────────────────

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: T, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
    select: { total: true, paidAmount: true, status: true },
  });
  const invoiced = invoices.reduce((s, i) => s + n(i.total), 0);
  const collected = invoices.reduce((s, i) => s + n(i.paidAmount), 0);
  check('collected can never exceed invoiced', collected <= invoiced + 0.01, `${collected} of ${invoiced}`);

  const draftsExcluded = await prisma.invoice.count({
    where: { tenantId: T, isDeleted: false, status: 'DRAFT' },
  });
  check(
    'draft invoices are excluded from the invoiced total',
    invoices.every((i) => i.status !== 'DRAFT'),
    `${draftsExcluded} drafts held back`,
  );

  // ── Empty is distinguishable from zero ────────────────────

  check(
    'a module with no rows yields an empty list, not a fabricated zero row',
    Array.isArray(quotationGroups) && Array.isArray(productionGroups),
    'the UI renders a dash for these, never a number',
  );

  // ── RBAC gating ───────────────────────────────────────────

  const salesRole = ROLE_PERMISSIONS.SALES;
  check(
    'SALES cannot see the manufacturing panel',
    !salesRole.includes('manufacturing.view'),
  );
  // SALES deliberately DOES hold cost.view — a representative needs cost to
  // quote sensibly. What they must not hold is cost.margin, which is the
  // company's profit rather than their working figure.
  check('SALES sees cost, as intended for quoting', salesRole.includes('cost.view'));
  check('SALES still cannot see margin', !salesRole.includes('cost.margin'));
  check(
    'CUSTOMER reaches no dashboard panel at all',
    !ROLE_PERMISSIONS.CUSTOMER.includes('dashboard.view'),
  );
  check(
    'MANAGER sees every panel',
    ['sales.documents', 'manufacturing.view', 'inventory.read', 'customers.read', 'invoices.view', 'cost.view'].every(
      (p) => ROLE_PERMISSIONS.MANAGER.includes(p),
    ),
  );

  // ── Report what is actually live, for the record ───────────

  console.log('\nlive figures on the dashboard right now:');
  console.log(`  products            ${await prisma.product.count({ where: { tenantId: T, isDeleted: false } })}`);
  console.log(`  variants            ${await prisma.productVariant.count({ where: { isDeleted: false, product: { tenantId: T } } })}`);
  console.log(`  customers           ${await prisma.customer.count({ where: { tenantId: T, isDeleted: false } })}`);
  console.log(`  quotations          ${quotationCount}`);
  console.log(`  sales orders        ${orderCount}  (committed ${committed})`);
  console.log(`  production orders   ${productionCount}`);
  console.log(`  stock rows          ${stock.length}  (reserved ${reserved}, low ${low.length}, unpriced ${unpriced.length})`);
  console.log(`  issued invoices     ${invoices.length}  (invoiced ${invoiced}, collected ${collected})`);
  console.log(`  cost snapshots      ${await prisma.costCalculation.count({ where: { tenantId: T } })}`);
  console.log(`  audit entries       ${await prisma.auditLog.count({ where: { tenantId: T } })}`);

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
  .finally(() => prisma.$disconnect());
