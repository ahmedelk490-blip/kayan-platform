import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير مقارنة الفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const lenMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - lenMs);

  const [invoices, expenses] = await withTenant(user.tenantId, (tx) =>
    Promise.all([
      tx.invoice.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: prevFrom, lte: to } },
        select: { total: true, issueDate: true },
      }),
      tx.secondaryExpense.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: prevFrom, lte: to } },
        select: { amount: true, expenseDate: true },
      }),
    ]),
  );

  const between = (d: Date | null, a: Date, b: Date) => !!d && d >= a && d <= b;
  const sumInv = (a: Date, b: Date) => invoices.filter((i) => between(i.issueDate as Date, a, b)).reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const sumExp = (a: Date, b: Date) => expenses.filter((e) => between(e.expenseDate as Date, a, b)).reduce((s, e) => s.plus(dec(e.amount)), dec(0));

  const cs = sumInv(from, to), ps = sumInv(prevFrom, prevTo);
  const ce = sumExp(from, to), pe = sumExp(prevFrom, prevTo);
  const pct = (c: ReturnType<typeof dec>, p: ReturnType<typeof dec>) => (p.eq(0) ? '' : Number(c.minus(p).dividedBy(p.abs()).times(100).toFixed(1)));

  const headers = ['المقياس', 'الفترة الحالية', 'الفترة السابقة', 'الفرق', 'نسبة التغيّر %'];
  const rows = [
    ['المبيعات المفوترة', cs.toNumber(), ps.toNumber(), cs.minus(ps).toNumber(), pct(cs, ps)],
    ['المصروفات المعتمدة', ce.toNumber(), pe.toNumber(), ce.minus(pe).toNumber(), pct(ce, pe)],
    ['الصافي', cs.minus(ce).toNumber(), ps.minus(pe).toNumber(), cs.minus(ce).minus(ps.minus(pe)).toNumber(), pct(cs.minus(ce), ps.minus(pe))],
  ];

  return csvResponse(stampedName('kayan-comparison'), headers, rows);
}
