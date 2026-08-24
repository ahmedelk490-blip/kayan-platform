import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير ربحية الموظفين للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('cost.margin');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const invoices = await withTenant(user.tenantId, (tx) =>
    tx.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { notIn: ['DRAFT', 'VOID'] },
        issueDate: { gte: from, lte: to },
      },
      select: {
        total: true,
        createdById: true,
        createdBy: { select: { nameAr: true, name: true } },
        lines: { select: { quantity: true, variant: { select: { cost: true, product: { select: { cost: true } } } } } },
      },
    }),
  );

  const map = new Map<
    string,
    { name: string; invoices: number; revenue: ReturnType<typeof dec>; cost: ReturnType<typeof dec> }
  >();
  for (const inv of invoices) {
    const id = inv.createdById ?? '—';
    const name = inv.createdBy?.nameAr ?? inv.createdBy?.name ?? 'غير محدَّد';
    const row = map.get(id) ?? { name, invoices: 0, revenue: dec(0), cost: dec(0) };
    row.invoices += 1;
    row.revenue = row.revenue.plus(dec(inv.total));
    for (const l of inv.lines) {
      const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
      if (unitCost !== null) row.cost = row.cost.plus(dec(l.quantity).times(dec(unitCost)));
    }
    map.set(id, row);
  }

  const headers = ['الموظف', 'عدد الفواتير', 'الإيراد', 'التكلفة', 'الربح'];
  const rows = [...map.values()]
    .sort((a, b) => b.revenue.minus(b.cost).minus(a.revenue.minus(a.cost)).toNumber())
    .map((r) => [r.name, r.invoices, r.revenue.toNumber(), r.cost.toNumber(), r.revenue.minus(r.cost).toNumber()]);

  return csvResponse(stampedName('kayan-employees'), headers, rows);
}
