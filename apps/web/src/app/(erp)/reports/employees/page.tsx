import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, formatQty, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'تحليل الموظفين' };

/**
 * تحليل كامل لكل مندوب/موظف في الفترة — من واقع نشاطه المسجّل:
 *
 *  • المبيعات والقطع والتكلفة والربح: من الفواتير التي أنشأها (createdById).
 *  • المصروفات: مصروفات ثانوية معتمدة منسوبة إليه (employeeId).
 *  • الرواتب والمكافآت: دفعات EmployeePayment له (SALARY / BONUS+COMMISSION).
 *  • صافي المساهمة = ربح فواتيره − (مصروفاته + راتبه + مكافآته).
 *
 * المكافأة تُمنح يدوياً من ملف الموظف؛ هذا التقرير يُظهر الأرقام التي يُبنى
 * عليها القرار ويصل لكل موظف بضغطة.
 */
export default async function EmployeeReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('cost.margin');
  const params = await searchParams;
  const range = resolveRange(params);
  const { from, to } = range;

  const [invoices, payments, expenses] = await Promise.all([
    prisma.invoice.findMany({
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
        lines: {
          select: {
            quantity: true,
            variant: { select: { cost: true, product: { select: { cost: true } } } },
          },
        },
      },
    }),
    prisma.employeePayment.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        kind: { in: ['SALARY', 'BONUS', 'COMMISSION'] },
        paidAt: { gte: from, lte: to },
      },
      select: { employeeId: true, kind: true, amount: true, employee: { select: { nameAr: true, name: true } } },
    }),
    prisma.secondaryExpense.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        employeeId: { not: null },
        expenseDate: { gte: from, lte: to },
      },
      select: { employeeId: true, amount: true, employee: { select: { nameAr: true, name: true } } },
    }),
  ]);

  type Row = {
    id: string;
    name: string;
    invoices: number;
    pieces: ReturnType<typeof dec>;
    revenue: ReturnType<typeof dec>;
    cost: ReturnType<typeof dec>;
    costKnown: boolean;
    expenses: ReturnType<typeof dec>;
    salary: ReturnType<typeof dec>;
    bonus: ReturnType<typeof dec>;
    hasInvoices: boolean;
  };
  const byEmp = new Map<string, Row>();
  const blank = (id: string, name: string): Row => ({
    id, name, invoices: 0, pieces: dec(0), revenue: dec(0), cost: dec(0),
    costKnown: true, expenses: dec(0), salary: dec(0), bonus: dec(0), hasInvoices: false,
  });

  for (const inv of invoices) {
    const id = inv.createdById ?? '—';
    const name = inv.createdBy?.nameAr ?? inv.createdBy?.name ?? 'غير محدَّد';
    const row = byEmp.get(id) ?? blank(id, name);
    row.hasInvoices = true;
    row.invoices += 1;
    row.revenue = row.revenue.plus(dec(inv.total));
    for (const l of inv.lines) {
      row.pieces = row.pieces.plus(dec(l.quantity));
      const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
      if (unitCost === null) row.costKnown = false;
      else row.cost = row.cost.plus(dec(l.quantity).times(dec(unitCost)));
    }
    byEmp.set(id, row);
  }

  for (const p of payments) {
    if (!p.employeeId) continue;
    const name = p.employee?.nameAr ?? p.employee?.name ?? 'موظف';
    const row = byEmp.get(p.employeeId) ?? blank(p.employeeId, name);
    if (p.kind === 'SALARY') row.salary = row.salary.plus(dec(p.amount));
    else row.bonus = row.bonus.plus(dec(p.amount)); // BONUS + COMMISSION
    byEmp.set(p.employeeId, row);
  }

  for (const e of expenses) {
    if (!e.employeeId) continue;
    const name = e.employee?.nameAr ?? e.employee?.name ?? 'موظف';
    const row = byEmp.get(e.employeeId) ?? blank(e.employeeId, name);
    row.expenses = row.expenses.plus(dec(e.amount));
    byEmp.set(e.employeeId, row);
  }

  const net = (r: Row) => r.revenue.minus(r.cost).minus(r.expenses).minus(r.salary).minus(r.bonus);
  const rows = [...byEmp.values()].sort((a, b) => net(b).minus(net(a)).toNumber());

  const sum = (pick: (r: Row) => ReturnType<typeof dec>) => rows.reduce((s, r) => s.plus(pick(r)), dec(0));
  const totalRevenue = sum((r) => r.revenue);
  const totalCost = sum((r) => r.cost);
  const totalPieces = sum((r) => r.pieces);
  const totalExpenses = sum((r) => r.expenses);
  const totalSalary = sum((r) => r.salary);
  const totalBonus = sum((r) => r.bonus);
  const totalInvoices = rows.reduce((s, r) => s + r.invoices, 0);
  const totalProfit = totalRevenue.minus(totalCost);
  const totalNet = sum((r) => net(r));

  return (
    <AppShell user={user} title="تحليل الموظفين">
      <ModuleHeader
        title="تحليل الموظفين"
        action={
          <div className="flex gap-2">
            <a href={`/reports/employees/export?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">
              تصدير Excel
            </a>
            <Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/employees" period={range.period} from={range.fromStr} to={range.toStr} />

      {rows.length === 0 ? (
        <Empty what="نشاط للموظفين" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="عدد الفواتير" value={String(totalInvoices)} strong />
            <Figure label="القطع المباعة" value={formatQty(totalPieces)} strong />
            <Figure label="إجمالي المبيعات" value={formatMoney(totalRevenue)} strong />
            <Figure label="ربح البضاعة" value={formatMoney(totalProfit)} strong tone={totalProfit.lt(0) ? 'bad' : undefined} />
            <Figure label="مصروفات منسوبة" value={formatMoney(totalExpenses)} />
            <Figure label="الرواتب المصروفة" value={formatMoney(totalSalary)} />
            <Figure label="المكافآت والعمولات" value={formatMoney(totalBonus)} />
            <Figure label="صافي المساهمة" value={formatMoney(totalNet)} strong tone={totalNet.lt(0) ? 'bad' : undefined} />
          </div>

          <Table
            headers={['الموظف', 'الفواتير', 'القطع', 'المبيعات', 'التكلفة', 'الربح', 'مصروفاته', 'راتبه', 'مكافآته', 'صافي المساهمة', '']}
            empty={false}
          >
            {rows.map((r) => {
              const profit = r.revenue.minus(r.cost);
              const n = net(r);
              return (
                <tr key={r.id} className="hover:bg-card-2">
                  <td className="px-4 py-3 text-txt">{r.name}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{r.invoices}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatQty(r.pieces)}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatMoney(r.revenue)}</td>
                  <td className="tnum px-4 py-3 text-txt-3">
                    {formatMoney(r.cost)}
                    {!r.costKnown && <span className="ms-1 text-[0.7rem] text-warn">(ناقصة)</span>}
                  </td>
                  <td className={`tnum px-4 py-3 font-medium ${profit.lt(0) ? 'text-bad' : 'text-brand'}`}>{formatMoney(profit)}</td>
                  <td className="tnum px-4 py-3 text-txt-3">{formatMoney(r.expenses)}</td>
                  <td className="tnum px-4 py-3 text-txt-3">{formatMoney(r.salary)}</td>
                  <td className="tnum px-4 py-3 text-txt-3">{formatMoney(r.bonus)}</td>
                  <td className={`tnum px-4 py-3 font-semibold ${n.lt(0) ? 'text-bad' : 'text-ok'}`}>{formatMoney(n)}</td>
                  <td className="px-4 py-3 text-end">
                    {r.id !== '—' && (
                      <Link href={`/hr/${r.id}`} className="text-[0.7rem] font-medium text-brand hover:underline">
                        الملف · منح مكافأة
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-2 text-[0.7rem] leading-[1.9] text-txt-4">
            المبيعات والقطع والتكلفة والربح من فواتير الموظف. «مصروفاته» = مصروفات معتمدة منسوبة إليه،
            و«راتبه/مكافآته» = دفعاته في الفترة. <span className="font-medium text-txt-3">صافي المساهمة = الربح − مصروفاته − راتبه − مكافآته</span>.
            المكافأة تُمنح يدوياً من «الملف · منح مكافأة» (تُسجَّل كدفعة مكافأة للموظف). «(ناقصة)» = بعض المنتجات بلا تكلفة محدَّدة.
          </p>
        </>
      )}
    </AppShell>
  );
}
