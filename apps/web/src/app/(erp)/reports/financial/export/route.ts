import {
  dec,
  balance,
  RECEIVABLE_STATUSES,
  EXPENSE_CATEGORY_AR,
  type ExpenseCategory,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { realProfit } from '@/lib/profit';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';
import { returnsByInvoice, netOwed } from '@/lib/receivables';

export const dynamic = 'force-dynamic';

/** تصدير التقرير المالي للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const [[invoices, receivable, expenses], rp] = await Promise.all([
    withTenant(user.tenantId, (tx) =>
      Promise.all([
        tx.invoice.findMany({
          where: {
            tenantId: user.tenantId,
            isDeleted: false,
            status: { notIn: ['DRAFT', 'VOID'] },
            issueDate: { gte: from, lte: to },
          },
          select: { id: true, total: true, paidAmount: true },
        }),
        tx.invoice.findMany({
          where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
          select: { id: true, total: true, paidAmount: true },
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
    ),
    // الربح الحقيقي — نفس مصدر الشاشة بالضبط (lib/profit) كي لا يخرج الملف
    // برقمٍ صافٍ يخالف ما يراه المالك في التقرير.
    realProfit(user.tenantId, from, to),
  ]);

  const invoiced = invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoices.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  // المستحق بعد المرتجعات — كما تحسبه شاشة البيان المالي ولوحة المدير.
  const receivableReturns = await returnsByInvoice(user.tenantId, receivable.map((i) => i.id));
  const outstanding = receivable.reduce(
    (s, i) => s.plus(balance(netOwed(i, receivableReturns), i.paidAmount)),
    dec(0),
  );
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
    ['الربح الصافي الحقيقي', ''],
    ['مبيعات البضاعة', rp.sales.toNumber()],
    ...(rp.deliveryCharged.gt(0)
      ? [['(أجور توصيل على الزبون — تمرّ للسائق، خارج الربح)', rp.deliveryCharged.toNumber()]]
      : []),
    ['− المرتجعات', rp.returns.toNumber()],
    [`− تكلفة البضاعة المباعة (${rp.pieces} قطعة)`, rp.cogs.toNumber()],
    ['= مجمل الربح', rp.grossProfit.toNumber()],
    ['− المصروفات التشغيلية المعتمدة', rp.expenses.toNumber()],
    ['− الرواتب (حصّة الفترة)', rp.salaries.toNumber()],
    ['− الالتزامات الثابتة (حصّة الفترة)', rp.fixed.toNumber()],
    ['− مكافآت وعمولات مصروفة', rp.bonuses.toNumber()],
    ['− الهالك المعتمد', rp.damage.toNumber()],
    ['+ جزاءات محصَّلة', rp.penalties.toNumber()],
    ['= صافي الربح', rp.net.toNumber()],
    ...(rp.missingCost.pieces > 0
      ? [[`تنبيه: ${rp.missingCost.pieces} قطعة بيعت بلا تكلفة مسجّلة — الربح أعلى من حقيقته`, '']]
      : []),
    ['', ''],
    ['المصروفات حسب البند', ''],
    ...[...byCategory.entries()]
      .sort((a, b) => b[1].minus(a[1]).toNumber())
      .map(([cat, amount]) => [EXPENSE_CATEGORY_AR[cat as ExpenseCategory] ?? cat, amount.toNumber()]),
  ];

  return csvResponse(stampedName('kayan-financial'), headers, rows);
}
