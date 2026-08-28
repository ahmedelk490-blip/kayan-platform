import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير تحليل الموظفين للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('cost.margin');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const [invoices, payments, expenses, returns] = await withTenant(user.tenantId, (tx) =>
    Promise.all([
      tx.invoice.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: from, lte: to } },
        select: {
          total: true, createdById: true,
          createdBy: { select: { nameAr: true, name: true } },
          lines: { select: { quantity: true, variant: { select: { cost: true, product: { select: { cost: true } } } } } },
        },
      }),
      tx.employeePayment.findMany({
        where: { tenantId: user.tenantId, deletedAt: null, kind: { in: ['SALARY', 'BONUS', 'COMMISSION'] }, paidAt: { gte: from, lte: to } },
        select: { employeeId: true, kind: true, amount: true, employee: { select: { nameAr: true, name: true } } },
      }),
      tx.secondaryExpense.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', employeeId: { not: null }, expenseDate: { gte: from, lte: to } },
        select: { employeeId: true, amount: true, employee: { select: { nameAr: true, name: true } } },
      }),
      tx.salesReturn.findMany({
        where: { tenantId: user.tenantId, isDeleted: false, returnDate: { gte: from, lte: to } },
        select: { invoiceId: true, totalAmount: true },
      }),
    ]),
  );

  const returnsByRep = new Map<string, ReturnType<typeof dec>>();
  if (returns.length > 0) {
    const invCreators = await withTenant(user.tenantId, (tx) =>
      tx.invoice.findMany({
        where: { id: { in: [...new Set(returns.map((r) => r.invoiceId))] }, tenantId: user.tenantId },
        select: { id: true, createdById: true },
      }),
    );
    const creatorOf = new Map(invCreators.map((i) => [i.id, i.createdById]));
    for (const r of returns) {
      const id = creatorOf.get(r.invoiceId) ?? '—';
      returnsByRep.set(id, (returnsByRep.get(id) ?? dec(0)).plus(dec(r.totalAmount)));
    }
  }

  type Row = { name: string; invoices: number; pieces: ReturnType<typeof dec>; revenue: ReturnType<typeof dec>; cost: ReturnType<typeof dec>; expenses: ReturnType<typeof dec>; salary: ReturnType<typeof dec>; bonus: ReturnType<typeof dec>; returns: ReturnType<typeof dec> };
  const map = new Map<string, Row>();
  const blank = (name: string): Row => ({ name, invoices: 0, pieces: dec(0), revenue: dec(0), cost: dec(0), expenses: dec(0), salary: dec(0), bonus: dec(0), returns: dec(0) });

  for (const inv of invoices) {
    const id = inv.createdById ?? '—';
    const name = inv.createdBy?.nameAr ?? inv.createdBy?.name ?? 'غير محدَّد';
    const row = map.get(id) ?? blank(name);
    row.invoices += 1;
    row.revenue = row.revenue.plus(dec(inv.total));
    for (const l of inv.lines) {
      row.pieces = row.pieces.plus(dec(l.quantity));
      const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
      if (unitCost !== null) row.cost = row.cost.plus(dec(l.quantity).times(dec(unitCost)));
    }
    map.set(id, row);
  }
  for (const p of payments) {
    if (!p.employeeId) continue;
    const row = map.get(p.employeeId) ?? blank(p.employee?.nameAr ?? p.employee?.name ?? 'موظف');
    if (p.kind === 'SALARY') row.salary = row.salary.plus(dec(p.amount));
    else row.bonus = row.bonus.plus(dec(p.amount));
    map.set(p.employeeId, row);
  }
  for (const e of expenses) {
    if (!e.employeeId) continue;
    const row = map.get(e.employeeId) ?? blank(e.employee?.nameAr ?? e.employee?.name ?? 'موظف');
    row.expenses = row.expenses.plus(dec(e.amount));
    map.set(e.employeeId, row);
  }

  for (const [id, amount] of returnsByRep) {
    const row = map.get(id) ?? blank(id === '—' ? 'غير محدَّد' : 'موظف');
    row.returns = row.returns.plus(amount);
    map.set(id, row);
  }

  const net = (r: Row) => r.revenue.minus(r.cost).minus(r.expenses).minus(r.salary).minus(r.bonus).minus(r.returns);
  const headers = ['الموظف', 'عدد الفواتير', 'القطع المباعة', 'المبيعات', 'التكلفة', 'الربح', 'مرتجعاته', 'مصروفاته', 'راتبه', 'مكافآته', 'صافي المساهمة'];
  const rows = [...map.values()]
    .sort((a, b) => net(b).minus(net(a)).toNumber())
    .map((r) => [
      r.name, r.invoices, r.pieces.toNumber(), r.revenue.toNumber(), r.cost.toNumber(),
      r.revenue.minus(r.cost).toNumber(), r.returns.toNumber(), r.expenses.toNumber(), r.salary.toNumber(), r.bonus.toNumber(), net(r).toNumber(),
    ]);

  return csvResponse(stampedName('kayan-employees'), headers, rows);
}
