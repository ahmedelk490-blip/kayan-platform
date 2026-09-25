import {
  dec,
  balance,
  RECEIVABLE_STATUSES,
  EXPENSE_CATEGORY_AR,
  DEDUCTION_KINDS,
  type ExpenseCategory,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';
import { returnsByInvoice, netOwed } from '@/lib/receivables';

export const dynamic = 'force-dynamic';

/** تصدير التقرير المالي للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const [
    invoices,
    receivable,
    expenses,
    returnsAgg,
    salariesAgg,
    damageAgg,
    penaltiesAgg,
    purchasesAgg,
  ] = await withTenant(user.tenantId, (tx) =>
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
      // بنود «الربح الصافي الشامل» — نفس مصادر الشاشة بالضبط كي لا يخرج الملف
      // برقمٍ صافٍ يخالف ما يراه المالك في التقرير.
      tx.salesReturn.aggregate({
        where: { tenantId: user.tenantId, isDeleted: false, returnDate: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      }),
      tx.employeePayment.aggregate({
        where: {
          tenantId: user.tenantId,
          isDeleted: false,
          kind: { notIn: DEDUCTION_KINDS },
          paidAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      tx.damageRecord.aggregate({
        where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', damageDate: { gte: from, lte: to } },
        _sum: { totalCost: true },
      }),
      tx.penalty.aggregate({
        where: { tenantId: user.tenantId, status: 'PAID', paidAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      tx.purchaseOrder.aggregate({
        where: {
          tenantId: user.tenantId,
          isDeleted: false,
          status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED'] },
          orderDate: { gte: from, lte: to },
        },
        _sum: { total: true },
      }),
    ]),
  );

  const invoiced = invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoices.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  // المستحق بعد المرتجعات — كما تحسبه شاشة البيان المالي ولوحة المدير.
  const receivableReturns = await returnsByInvoice(user.tenantId, receivable.map((i) => i.id));
  const outstanding = receivable.reduce(
    (s, i) => s.plus(balance(netOwed(i, receivableReturns), i.paidAmount)),
    dec(0),
  );
  const expenseTotal = expenses.reduce((s, e) => s.plus(dec(e.amount)), dec(0));

  const returnsOut = dec(returnsAgg._sum.totalAmount ?? 0);
  const salariesOut = dec(salariesAgg._sum.amount ?? 0);
  const damageOut = dec(damageAgg._sum.totalCost ?? 0);
  const penaltiesIn = dec(penaltiesAgg._sum.amount ?? 0);
  const purchasesOut = dec(purchasesAgg._sum.total ?? 0);
  const fullNet = invoiced
    .minus(returnsOut)
    .minus(expenseTotal)
    .minus(salariesOut)
    .minus(damageOut)
    .minus(purchasesOut)
    .plus(penaltiesIn);

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
    ['الربح الصافي الشامل', ''],
    ['المبيعات المفوترة', invoiced.toNumber()],
    ['− المرتجعات', returnsOut.toNumber()],
    ['− المصروفات المعتمدة', expenseTotal.toNumber()],
    ['− الرواتب والمكافآت', salariesOut.toNumber()],
    ['− تكلفة الهالك المعتمد', damageOut.toNumber()],
    ['− المشتريات المؤكَّدة', purchasesOut.toNumber()],
    ['+ جزاءات محصَّلة', penaltiesIn.toNumber()],
    ['= الربح الصافي الشامل', fullNet.toNumber()],
    ['', ''],
    ['المصروفات حسب البند', ''],
    ...[...byCategory.entries()]
      .sort((a, b) => b[1].minus(a[1]).toNumber())
      .map(([cat, amount]) => [EXPENSE_CATEGORY_AR[cat as ExpenseCategory] ?? cat, amount.toNumber()]),
  ];

  return csvResponse(stampedName('kayan-financial'), headers, rows);
}
