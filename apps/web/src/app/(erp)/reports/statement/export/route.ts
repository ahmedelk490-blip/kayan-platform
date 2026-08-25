import { dec, EXPENSE_CATEGORY_AR, type ExpenseCategory } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير البيان المالي الشامل للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const [lines, salaries, expenses, damages, stock] = await withTenant(user.tenantId, (tx) =>
    Promise.all([
      tx.invoiceLine.findMany({
        where: { invoice: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: from, lte: to } } },
        select: { quantity: true, lineTotal: true, product: { select: { nameAr: true, cost: true, category: { select: { nameAr: true } } } } },
      }),
      tx.employeePayment.findMany({ where: { tenantId: user.tenantId, deletedAt: null, kind: 'SALARY', paidAt: { gte: from, lte: to } }, select: { amount: true } }),
      tx.secondaryExpense.findMany({ where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: from, lte: to } }, select: { amount: true, category: true } }),
      tx.damageRecord.findMany({ where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', damageDate: { gte: from, lte: to } }, select: { totalCost: true } }),
      tx.stock.findMany({ where: { variant: { product: { tenantId: user.tenantId } } }, select: { onHand: true, variant: { select: { cost: true, product: { select: { cost: true } } } } } }),
    ]),
  );

  let totalSales = dec(0), pieces = dec(0), cogs = dec(0);
  const byCategory = new Map<string, ReturnType<typeof dec>>();
  const byProduct = new Map<string, { revenue: ReturnType<typeof dec>; qty: ReturnType<typeof dec> }>();
  for (const l of lines) {
    const rev = dec(l.lineTotal), qty = dec(l.quantity);
    totalSales = totalSales.plus(rev); pieces = pieces.plus(qty); cogs = cogs.plus(qty.times(dec(l.product?.cost ?? 0)));
    const cat = l.product?.category?.nameAr ?? 'غير مصنّف';
    byCategory.set(cat, (byCategory.get(cat) ?? dec(0)).plus(rev));
    const pn = l.product?.nameAr ?? 'غير معروف';
    const p = byProduct.get(pn) ?? { revenue: dec(0), qty: dec(0) };
    byProduct.set(pn, { revenue: p.revenue.plus(rev), qty: p.qty.plus(qty) });
  }
  const salaryTotal = salaries.reduce((s, p) => s.plus(dec(p.amount)), dec(0));
  const damageTotal = damages.reduce((s, d) => s.plus(dec(d.totalCost)), dec(0));
  const expensesByCat = new Map<string, ReturnType<typeof dec>>();
  for (const e of expenses) expensesByCat.set(e.category, (expensesByCat.get(e.category) ?? dec(0)).plus(dec(e.amount)));
  const expenseTotal = expenses.reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const inventoryValue = stock.reduce((s, r) => {
    const unit = r.variant.cost ?? r.variant.product.cost ?? null;
    return unit === null ? s : s.plus(dec(r.onHand).times(dec(unit)));
  }, dec(0));
  const grossProfit = totalSales.minus(cogs);
  const totalOpex = salaryTotal.plus(expenseTotal).plus(damageTotal);
  const net = grossProfit.minus(totalOpex);

  const headers = ['البند', 'القيمة (د.ع)'];
  const rows: unknown[][] = [
    ['المبيعات (حسب الصنف)', ''],
    ...[...byCategory.entries()].sort((a, b) => b[1].minus(a[1]).toNumber()).map(([c, v]) => [c, v.toNumber()]),
    ['إجمالي المبيعات', totalSales.toNumber()],
    ['عدد القطع المباعة', pieces.toNumber()],
    ['', ''],
    ['تكلفة البضاعة المباعة', cogs.toNumber()],
    ['مجمل الربح', grossProfit.toNumber()],
    ['', ''],
    ['المصروفات', ''],
    ['الرواتب', salaryTotal.toNumber()],
    ...[...expensesByCat.entries()].sort((a, b) => b[1].minus(a[1]).toNumber()).map(([c, v]) => [(EXPENSE_CATEGORY_AR as Record<string, string>)[c] ?? c, v.toNumber()]),
    ['الهالك', damageTotal.toNumber()],
    ['إجمالي المصروفات', totalOpex.toNumber()],
    ['', ''],
    ['الربح الصافي', net.toNumber()],
    ['قيمة المخزون الحالية (بالتكلفة)', inventoryValue.toNumber()],
    ['', ''],
    ['المنتجات الأكثر طلباً', 'العدد / الإيراد'],
    ...[...byProduct.entries()].sort((a, b) => b[1].qty.minus(a[1].qty).toNumber()).slice(0, 20).map(([n, v]) => [n, `${v.qty.toNumber()} / ${v.revenue.toNumber()}`]),
  ];

  return csvResponse(stampedName('kayan-statement'), headers, rows);
}
