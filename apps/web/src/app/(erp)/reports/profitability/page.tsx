import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatMoney,
  formatQty,
  profitability,
  periodRange,
  isPeriod,
  dec,
  type Period,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { PeriodTabs, Figure, Empty } from '../Shell';

export const metadata: Metadata = { title: 'ربحية المنتجات' };

/**
 * ربحية المنتجات.
 *
 * Revenue comes from sold lines. Cost comes from the nearest cost SNAPSHOT
 * for the same variant — never from today's formula, because a formula
 * republished last week must not rewrite what last month earned.
 *
 * Where no snapshot exists the profit is UNKNOWN, not equal to the revenue.
 * That distinction is the whole point: "we never costed this" and "this cost
 * nothing" lead to opposite decisions.
 */
export default async function ProfitabilityReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('cost.margin');
  const params = await searchParams;
  const raw = Array.isArray(params.period) ? params.period[0] : params.period;
  const period: Period = raw && isPeriod(raw) ? raw : 'YEAR';
  const { from, to } = periodRange(period);

  const lines = await prisma.salesOrderLine.findMany({
    where: {
      salesOrder: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { not: 'CANCELLED' },
        orderDate: { gte: from, lte: to },
      },
    },
    include: {
      product: { select: { nameAr: true } },
      variant: { select: { id: true, sku: true } },
    },
  });

  // One cost snapshot per variant — the most recent, since it reflects the
  // formula version in force closest to the sale.
  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  const snapshots = variantIds.length
    ? await prisma.costCalculation.findMany({
        where: { tenantId: user.tenantId, variantId: { in: variantIds } },
        orderBy: { computedAt: 'desc' },
        select: { variantId: true, costPerPiece: true },
      })
    : [];

  const costByVariant = new Map<string, unknown>();
  for (const snap of snapshots) {
    if (!costByVariant.has(snap.variantId)) costByVariant.set(snap.variantId, snap.costPerPiece);
  }

  // Group by product, since that is the decision unit a manager thinks in.
  const grouped = new Map<
    string,
    { label: string; revenue: ReturnType<typeof dec>; quantity: ReturnType<typeof dec>; cost: ReturnType<typeof dec> | null }
  >();

  for (const line of lines) {
    const key = line.productId;
    const entry =
      grouped.get(key) ??
      { label: line.product.nameAr, revenue: dec(0), quantity: dec(0), cost: dec(0) };

    entry.revenue = entry.revenue.plus(dec(line.lineTotal));
    entry.quantity = entry.quantity.plus(dec(line.quantity));

    const unitCost = costByVariant.get(line.variantId);
    if (unitCost === undefined) {
      // One uncosted line makes the whole product's cost unknown. Adding the
      // costed lines only would understate cost and overstate margin.
      entry.cost = null;
    } else if (entry.cost !== null) {
      entry.cost = entry.cost.plus(dec(unitCost as never).times(dec(line.quantity)));
    }

    grouped.set(key, entry);
  }

  const rows = profitability(
    [...grouped.values()].map((g) => ({
      label: g.label,
      revenue: g.revenue,
      cost: g.cost,
      quantity: g.quantity,
    })),
  ).sort((a, b) => dec(b.revenue).comparedTo(dec(a.revenue)));

  const known = rows.filter((r) => !r.costUnknown);
  const revenueTotal = rows.reduce((s, r) => s.plus(r.revenue), dec(0));
  const profitTotal = known.reduce((s, r) => s.plus(r.grossProfit ?? dec(0)), dec(0));

  return (
    <AppShell user={user} title="ربحية المنتجات">
      <ModuleHeader
        title="ربحية المنتجات"
        action={
          <Link href="/reports" className="erp-btn-ghost">
            كل التقارير
          </Link>
        }
      />

      <PeriodTabs basePath="/reports/profitability" active={period} />

      {rows.length === 0 ? (
        <Empty what="مبيعات" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="الإيراد" value={formatMoney(revenueTotal)} strong />
            <Figure
              label="ربح مجمل معروف"
              value={formatMoney(profitTotal)}
              hint={`من ${known.length} من ${rows.length} منتج`}
              strong
            />
            <Figure
              label="منتجات بلا تكلفة محفوظة"
              value={String(rows.length - known.length)}
              hint="ربحها غير معروف، لا صفر"
              tone={rows.length - known.length > 0 ? 'warn' : undefined}
            />
            <Figure
              label="الهامش على المعروف"
              value={
                known.length === 0 || dec(known.reduce((s, r) => s.plus(r.revenue), dec(0))).lte(0)
                  ? '—'
                  : `${profitTotal
                      .dividedBy(known.reduce((s, r) => s.plus(r.revenue), dec(0)))
                      .times(100)
                      .toFixed(1)}٪`
              }
            />
          </div>

          <Table
            headers={['المنتج', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش']}
            empty={false}
          >
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-3 text-txt">{row.label}</td>
                <td className="tnum px-4 py-3 text-txt-2">{formatQty(row.quantity)}</td>
                <td className="tnum px-4 py-3 text-txt-2">{formatMoney(row.revenue)}</td>
                <td className="tnum px-4 py-3 text-txt-3">
                  {row.costUnknown ? (
                    <span className="text-warn">غير محسوبة</span>
                  ) : (
                    formatMoney(row.cost as never)
                  )}
                </td>
                <td
                  className={`tnum px-4 py-3 font-medium ${
                    row.grossProfit === null
                      ? 'text-txt-4'
                      : dec(row.grossProfit).isNegative()
                        ? 'text-bad'
                        : 'text-brand'
                  }`}
                >
                  {row.grossProfit === null ? '—' : formatMoney(row.grossProfit)}
                </td>
                <td className="tnum px-4 py-3 text-txt-2">
                  {row.marginPercent === null ? '—' : `${dec(row.marginPercent).toFixed(1)}٪`}
                </td>
              </tr>
            ))}
          </Table>

          <p className="mt-4 max-w-[70ch] text-[0.7rem] leading-[1.9] text-txt-4">
            التكلفة مأخوذة من أحدث لقطة تكلفة محفوظة لكل متغيّر، لا من المعادلة الحالية —
            معادلة نُشرت الأسبوع الماضي يجب ألا تُعيد كتابة ربح الشهر الماضي. والمنتج الذي
            يضم بنداً واحداً بلا لقطة تُعرض تكلفته «غير محسوبة» كاملةً، لأن جمع البنود
            المحسوبة وحدها يُنقص التكلفة ويضخّم الهامش.
          </p>
        </>
      )}
    </AppShell>
  );
}
