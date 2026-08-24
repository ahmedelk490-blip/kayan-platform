import { dec, monthlySeries } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير مبيعات الفترة (الفواتير شهرياً) إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
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
      select: { total: true, paidAmount: true, issueDate: true },
    }),
  );

  const series = monthlySeries(
    invoices.map((i) => ({ date: i.issueDate as Date, amount: i.total })),
    from,
    to,
  );
  const collected = monthlySeries(
    invoices.map((i) => ({ date: i.issueDate as Date, amount: i.paidAmount })),
    from,
    to,
  );

  const headers = ['الشهر', 'عدد الفواتير', 'قيمة الفواتير', 'المحصَّل'];
  const rows = series.map((p, i) => [
    p.key,
    p.count,
    dec(p.value).toNumber(),
    dec(collected[i]?.value ?? 0).toNumber(),
  ]);

  return csvResponse(stampedName('kayan-sales'), headers, rows);
}
