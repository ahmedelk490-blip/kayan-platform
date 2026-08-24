import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير البيان المالي للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const [lines, salaries, expenses, damages] = await withTenant(user.tenantId, (tx) =>
    Promise.all([
      tx.invoiceLine.findMany({
        where: {
          invoice: {
            tenantId: user.tenantId,
            isDeleted: false,
            status: { notIn: ['DRAFT', 'VOID'] },
            issueDate: { gte: from, lte: to },
          },
        },
        select: { lineTotal: true, product: { select: { category: { select: { nameAr: true } } } } },
      }),
      tx.employeePayment.findMany({
        where: { tenantId: user.tenantId, deletedAt: null, kind: 'SALARY', paidAt: { gte: from, lte: to } },
        select: { amount: true },
      }),
      tx.secondaryExpense.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: from, lte: to } },
        select: { amount: true, category: true },
      }),
      tx.damageRecord.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', damageDate: { gte: from, lte: to } },
        select: { totalCost: true },
      }),
    ]),
  );

  const byCategory = new Map<string, ReturnType<typeof dec>>();
  for (const l of lines) {
    const cat = l.product?.category?.nameAr ?? 'غير مصنّف';
    byCategory.set(cat, (byCategory.get(cat) ?? dec(0)).plus(dec(l.lineTotal)));
  }
  const salesRows = [...byCategory.entries()].sort((a, b) => b[1].minus(a[1]).toNumber());
  const totalSales = salesRows.reduce((s, [, v]) => s.plus(v), dec(0));

  const salaryTotal = salaries.reduce((s, p) => s.plus(dec(p.amount)), dec(0));
  const foodTotal = expenses.filter((e) => e.category === 'FOOD').reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const secondaryTotal = expenses.filter((e) => e.category !== 'FOOD').reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const damageTotal = damages.reduce((s, d) => s.plus(dec(d.totalCost)), dec(0));
  const totalCosts = salaryTotal.plus(foodTotal).plus(damageTotal).plus(secondaryTotal);
  const net = totalSales.minus(totalCosts);

  const headers = ['البند', 'القيمة (د.ع)'];
  const rows: unknown[][] = [
    ['المبيعات', ''],
    ...salesRows.map(([cat, v]) => [cat, v.toNumber()]),
    ['إجمالي المبيعات', totalSales.toNumber()],
    ['', ''],
    ['التكاليف التشغيلية', ''],
    ['الرواتب', salaryTotal.toNumber()],
    ['الأكل', foodTotal.toNumber()],
    ['الهالك والرواجع', damageTotal.toNumber()],
    ['صرفيات ثانوية', secondaryTotal.toNumber()],
    ['إجمالي التكاليف', totalCosts.toNumber()],
    ['', ''],
    ['الربح الصافي', net.toNumber()],
  ];

  return csvResponse(stampedName('kayan-statement'), headers, rows);
}
