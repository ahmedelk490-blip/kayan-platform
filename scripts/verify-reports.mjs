/**
 * Reporting verification.
 *
 * The claim this module lives or dies on is that it never presents an ABSENCE
 * as a MEASUREMENT. Zero revenue because nothing sold and zero revenue
 * because nothing was recorded are the same number and demand opposite
 * responses, so every aggregate here is attacked on that distinction.
 *
 * Safe to re-run: nothing is written.
 */
import { PrismaClient } from '@prisma/client';
import {
  periodRange,
  monthKey,
  monthlySeries,
  seriesPeak,
  total,
  isEmpty,
  average,
  valuation,
  profitability,
  throughput,
  isPeriod,
  PERIODS,
} from '../packages/domain/src/reporting.ts';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const n = (v) => (v === null || v === undefined ? null : Number(v.toString()));
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  // ── Absence is not zero ───────────────────────────────────

  const nothing = total([]);
  const zero = total([0, 0]);
  check('an empty total reports zero rows', isEmpty(nothing) && nothing.count === 0);
  check(
    'two recorded zeros are NOT empty — the distinction the report rests on',
    !isEmpty(zero) && n(zero.value) === 0 && zero.count === 2,
  );
  check('averaging nothing is null, not a division by zero', average(nothing) === null);
  check('averaging real rows works', n(average(total([10, 20, 30]))) === 20);

  // ── Periods ───────────────────────────────────────────────

  const ref = new Date(2026, 7, 15); // 15 August 2026
  const month = periodRange('MONTH', ref);
  check('MONTH starts on the first', month.from.getDate() === 1 && month.from.getMonth() === 7);
  check('MONTH ends on the last day', month.to.getDate() === 31);

  const quarter = periodRange('QUARTER', ref);
  check('QUARTER starting in August is July–September', quarter.from.getMonth() === 6 && quarter.to.getMonth() === 8);

  const year = periodRange('YEAR', ref);
  check('YEAR spans January to December', year.from.getMonth() === 0 && year.to.getMonth() === 11);

  const all = periodRange('ALL', ref);
  check('ALL is a window wide enough to hold everything', all.from < new Date(2001, 0, 1) && all.to > new Date(2100, 0, 1));
  check('every period is handled', PERIODS.every((p) => Boolean(periodRange(p, ref))));
  check('an unknown period string is rejected', !isPeriod('WEEK') && isPeriod('MONTH'));

  // ── Monthly series ────────────────────────────────────────

  {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 3, 30);
    const series = monthlySeries(
      [
        { date: new Date(2026, 0, 10), amount: 100 },
        { date: new Date(2026, 0, 20), amount: 50 },
        { date: new Date(2026, 2, 5), amount: 300 },
        { date: new Date(2025, 11, 1), amount: 999 }, // outside the window
      ],
      from,
      to,
    );
    check('the series covers every month in the window', series.length === 4, `${series.length}`);
    check('January sums its two rows', n(series[0].value) === 150 && series[0].count === 2);
    check(
      'February is present with a count of zero, not omitted',
      series[1].count === 0 && n(series[1].value) === 0,
      'a gap in trading must be visible',
    );
    check('March carries its row', n(series[2].value) === 300);
    check('a row outside the window is excluded', series.reduce((s, p) => s + p.count, 0) === 3);
    check('the peak is the largest value', n(seriesPeak(series)) === 300);
    check('an all-zero series still yields a non-zero peak', n(seriesPeak(monthlySeries([], from, to))) === 1, 'so bars do not divide by zero');
    check('month keys are zero-padded', monthKey(new Date(2026, 2, 1)) === '2026-03');
  }

  // ── Valuation ─────────────────────────────────────────────

  {
    const v = valuation([
      { onHand: 10, unitCost: 5 },
      { onHand: 4, unitCost: 2.5 },
      { onHand: 7, unitCost: null },
      { onHand: 0, unitCost: null },
    ]);
    check('valuation multiplies and sums', n(v.value) === 60, `${v.value}`);
    check('units count every row, priced or not', n(v.units) === 21);
    check(
      'stock with no known cost is counted, not valued at zero',
      v.unpricedRows === 1,
      'silently under-valuing the holding only surfaces at a stocktake',
    );
    check('a zero balance with no cost is not flagged', v.unpricedRows === 1);
  }

  // ── Profitability ─────────────────────────────────────────

  {
    const rows = profitability([
      { label: 'مُكلَّف', revenue: 1000, cost: 600, quantity: 10 },
      { label: 'غير مُكلَّف', revenue: 500, cost: null, quantity: 5 },
      { label: 'خاسر', revenue: 100, cost: 150, quantity: 1 },
    ]);
    check('profit is revenue minus cost', n(rows[0].grossProfit) === 400);
    check('margin is a percentage of revenue', n(rows[0].marginPercent) === 40);
    check(
      'a missing cost gives UNKNOWN profit, not profit equal to revenue',
      rows[1].grossProfit === null && rows[1].costUnknown,
      'the single most dangerous shortcut in this report',
    );
    check('an unknown cost also gives no margin', rows[1].marginPercent === null);
    check('a loss stays negative rather than clamping', n(rows[2].grossProfit) === -50);
  }

  // ── Throughput ────────────────────────────────────────────

  {
    const flow = throughput([
      { status: 'COMPLETED', quantity: 100, startedAt: new Date(2026, 0, 1), completedAt: new Date(2026, 0, 5) },
      { status: 'COMPLETED', quantity: 50, startedAt: new Date(2026, 0, 1), completedAt: new Date(2026, 0, 3) },
      { status: 'COMPLETED', quantity: 25, startedAt: null, completedAt: new Date(2026, 0, 9) },
      { status: 'IN_PROGRESS', quantity: 10, startedAt: new Date(2026, 0, 8), completedAt: null },
    ]);
    check('orders group by status', flow.byStatus.COMPLETED.orders === 3 && flow.byStatus.IN_PROGRESS.orders === 1);
    check('quantities group by status', n(flow.byStatus.COMPLETED.quantity) === 175);
    check('completed totals are separate', flow.completedOrders === 3 && n(flow.completedQuantity) === 175);
    check(
      'cycle time averages only orders that recorded both ends',
      flow.averageDays === 3,
      'an order with no start would otherwise report a four-day build as instant',
    );
    check(
      'nothing completed means no average, not zero days',
      throughput([{ status: 'DRAFT', quantity: 5, startedAt: null, completedAt: null }]).averageDays === null,
    );
  }

  // ── Against the live database ─────────────────────────────

  const { from, to } = periodRange('ALL');
  const [orders, invoices, stock, production] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { isDeleted: false, status: { not: 'CANCELLED' } },
      select: { total: true, orderDate: true },
    }),
    prisma.invoice.findMany({
      where: { isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
      select: { total: true, issueDate: true },
    }),
    prisma.stock.findMany({ include: { variant: { include: { product: true } } } }),
    prisma.productionOrder.findMany({
      where: { isDeleted: false },
      select: { status: true, quantity: true, startedAt: true, completedAt: true },
    }),
  ]);

  const orderTotal = total(orders.map((o) => o.total));
  check('the sales report reads real orders', orderTotal.count === orders.length, `${orderTotal.count} orders`);

  const series = monthlySeries(
    invoices.filter((i) => i.issueDate).map((i) => ({ date: i.issueDate, amount: i.total })),
    from,
    to,
  );
  check('the monthly series builds over the real window', series.length > 0);

  const live = valuation(
    stock.map((s) => ({ onHand: s.onHand, unitCost: s.variant.cost ?? s.variant.product.cost ?? null })),
  );
  check(
    'live stock valuation runs and reports its unpriced rows',
    live.unpricedRows >= 0 && n(live.units) >= 0,
    `${n(live.value)} value, ${live.unpricedRows} unpriced of ${stock.length}`,
  );

  const flow = throughput(production);
  check(
    'live throughput runs',
    flow.completedOrders >= 0,
    `${production.length} orders, ${flow.completedOrders} completed, avg ${flow.averageDays ?? '—'}`,
  );

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
