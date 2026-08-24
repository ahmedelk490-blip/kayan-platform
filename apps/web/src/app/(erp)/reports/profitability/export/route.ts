import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير ربحية المنتجات للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('cost.margin');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const lines = await withTenant(user.tenantId, (tx) =>
    tx.salesOrderLine.findMany({
      where: {
        salesOrder: {
          tenantId: user.tenantId,
          isDeleted: false,
          status: { not: 'CANCELLED' },
          orderDate: { gte: from, lte: to },
        },
      },
      include: { product: { select: { nameAr: true } }, variant: { select: { id: true } } },
    }),
  );

  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  const snapshots = variantIds.length
    ? await withTenant(user.tenantId, (tx) =>
        tx.costCalculation.findMany({
          where: { tenantId: user.tenantId, variantId: { in: variantIds } },
          orderBy: { computedAt: 'desc' },
          select: { variantId: true, costPerPiece: true },
        }),
      )
    : [];

  const costByVariant = new Map<string, unknown>();
  for (const snap of snapshots) {
    if (!costByVariant.has(snap.variantId)) costByVariant.set(snap.variantId, snap.costPerPiece);
  }

  const grouped = new Map<
    string,
    { label: string; revenue: ReturnType<typeof dec>; quantity: ReturnType<typeof dec>; cost: ReturnType<typeof dec> | null }
  >();
  for (const line of lines) {
    const entry =
      grouped.get(line.productId) ??
      { label: line.product.nameAr, revenue: dec(0), quantity: dec(0), cost: dec(0) };
    entry.revenue = entry.revenue.plus(dec(line.lineTotal));
    entry.quantity = entry.quantity.plus(dec(line.quantity));
    const unitCost = costByVariant.get(line.variantId);
    if (unitCost === undefined) entry.cost = null;
    else if (entry.cost !== null) entry.cost = entry.cost.plus(dec(unitCost as never).times(dec(line.quantity)));
    grouped.set(line.productId, entry);
  }

  const headers = ['المنتج', 'الكمية المباعة', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %'];
  const rows = [...grouped.values()]
    .sort((a, b) => b.revenue.minus(a.revenue).toNumber())
    .map((e) => {
      const profit = e.cost === null ? null : e.revenue.minus(e.cost);
      const margin = profit === null || e.revenue.lte(0) ? null : profit.dividedBy(e.revenue).times(100);
      return [
        e.label,
        e.quantity.toNumber(),
        e.revenue.toNumber(),
        e.cost === null ? 'غير محسوبة' : e.cost.toNumber(),
        profit === null ? '' : profit.toNumber(),
        margin === null ? '' : Number(margin.toFixed(1)),
      ];
    });

  return csvResponse(stampedName('kayan-profitability'), headers, rows);
}
