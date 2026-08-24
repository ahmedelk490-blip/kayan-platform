import { dec, monthlySeries } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير التدفق النقدي للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const [payments, expenses] = await withTenant(user.tenantId, (tx) =>
    Promise.all([
      tx.payment.findMany({ where: { tenantId: user.tenantId, paidAt: { gte: from, lte: to } }, select: { amount: true, paidAt: true } }),
      tx.secondaryExpense.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: from, lte: to } },
        select: { amount: true, expenseDate: true },
      }),
    ]),
  );

  const inSeries = monthlySeries(payments.map((p) => ({ date: p.paidAt as Date, amount: p.amount })), from, to);
  const outSeries = monthlySeries(expenses.map((e) => ({ date: e.expenseDate as Date, amount: e.amount })), from, to);

  let running = dec(0);
  const headers = ['الشهر', 'الداخل', 'الخارج', 'الصافي', 'التراكمي'];
  const rows = inSeries.map((pt, i) => {
    const inn = dec(pt.value);
    const out = dec(outSeries[i]?.value ?? 0);
    const net = inn.minus(out);
    running = running.plus(net);
    return [pt.key, inn.toNumber(), out.toNumber(), net.toNumber(), running.toNumber()];
  });

  return csvResponse(stampedName('kayan-cashflow'), headers, rows);
}
