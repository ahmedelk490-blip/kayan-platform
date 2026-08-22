import {
  dec,
  isPeriod,
  periodRange,
  balance,
  RECEIVABLE_STATUSES,
  EXPENSE_CATEGORY_AR,
  type ExpenseCategory,
  type Period,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';

export const dynamic = 'force-dynamic';

/** تصدير التقرير المالي للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const raw = new URL(request.url).searchParams.get('period');
  const period: Period = raw && isPeriod(raw) ? raw : 'YEAR';
  const { from, to } = periodRange(period);

  const [invoices, receivable, expenses] = await withTenant(user.tenantId, (tx) =>
    Promise.all([
      tx.invoice.findMany({
        where: {
          tenantId: user.tenantId,
          isDeleted: false,
          status: { notIn: ['DRAFT', 'VOID'] },
          issueDate: { gte: from, lte: to },
        },
        select: { total: true, paidAmount: true },
      }),
      tx.invoice.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
        select: { total: true, paidAmount: true },
      }),
      tx.secondaryExpense.findMany({
        where: {
          tenantId: user.tenantId,
          isDeleted: false,
          status: 'APPROVED',
          expenseDate: { gte: from, lte: to },
        },
        select: { amount: true, category: true },
      }),
    ]),
  );

  const invoiced = invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoices.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  const outstanding = receivable.reduce((s, i) => s.plus(balance(i.total, i.paidAmount)), dec(0));
  const expenseTotal = expenses.reduce((s, e) => s.plus(dec(e.amount)), dec(0));

  const byCategory = new Map<string, ReturnType<typeof dec>>();
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? dec(0)).plus(dec(e.amount)));
  }

  const headers = ['البند', 'القيمة'];
  const rows: unknown[][] = [
    ['المبيعات المفوترة', invoiced.toNumber()],
    ['المحصَّل', collected.toNumber()],
    ['المستحق حالياً', outstanding.toNumber()],
    ['المصروفات المعتمدة', expenseTotal.toNumber()],
    ['الصافي (مبيعات − مصروفات)', invoiced.minus(expenseTotal).toNumber()],
    ['التدفّق النقدي (محصَّل − مصروفات)', collected.minus(expenseTotal).toNumber()],
    ['', ''],
    ['المصروفات حسب البند', ''],
    ...[...byCategory.entries()]
      .sort((a, b) => b[1].minus(a[1]).toNumber())
      .map(([cat, amount]) => [EXPENSE_CATEGORY_AR[cat as ExpenseCategory] ?? cat, amount.toNumber()]),
  ];

  return csvResponse(stampedName('kayan-financial'), headers, rows);
}
