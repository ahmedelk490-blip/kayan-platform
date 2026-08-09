import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  can,
  dec,
  formatMoney,
  netProfit,
  EXPENSE_CATEGORY_AR,
  APPROVAL_STATUS_AR,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Pager, Badge } from '@/components/crud/Shell';
import { Toolbar } from '@/components/crud/Toolbar';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { monthRange, dateInput } from '@/lib/ops';
import { ExpenseForm } from './ExpenseForm';
import { createExpense, setExpenseStatus, deleteExpense } from './actions';

export const metadata: Metadata = { title: 'المصروفات الثانوية' };

const SORTS = [
  { value: 'expenseDate', label: 'التاريخ' },
  { value: 'amount', label: 'المبلغ' },
  { value: 'number', label: 'الرقم' },
];

const ERRORS: Record<string, string> = {
  self: 'لا يعتمد المصروفَ من سجّله. الفصل بين التسجيل والاعتماد هو الغرض من الخطوة.',
  approved: 'لا يمكن حذف مصروف معتمد — سبق أن دخل في صافي ربح فترة مُعلنة.',
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('expenses.view');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'expenseDate',
    allowedSorts: SORTS.map((s) => s.value),
  });

  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;
  const errKey = Array.isArray(params.err) ? params.err[0] : params.err;
  const month = monthRange(Array.isArray(params.month) ? params.month[0] : params.month);

  const where: Prisma.SecondaryExpenseWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(query.q ? { OR: [{ number: { contains: query.q } }, { notes: { contains: query.q } }] } : {}),
  };

  const [rows, count, employees, monthExpenses, monthDamage, monthPenalties] = await Promise.all([
    prisma.secondaryExpense.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        employee: { select: { nameAr: true, name: true } },
        createdBy: { select: { nameAr: true, name: true } },
      },
    }),
    prisma.secondaryExpense.count({ where }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, name: true, nameAr: true },
      orderBy: { name: 'asc' },
    }),
    // Only APPROVED counts. A pending claim is not yet a cost, and counting
    // it would let anyone move the profit figure by filing a form.
    prisma.secondaryExpense.groupBy({
      by: ['category'],
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        expenseDate: { gte: month.from, lte: month.to },
      },
      _sum: { amount: true },
    }),
    prisma.damageRecord.aggregate({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        damageDate: { gte: month.from, lte: month.to },
      },
      _sum: { totalCost: true },
    }),
    prisma.penalty.aggregate({
      where: {
        tenantId: user.tenantId,
        status: 'PAID',
        paidAt: { gte: month.from, lte: month.to },
      },
      _sum: { amount: true },
    }),
  ]);

  const canWrite = can(user.role, 'expenses.write');
  const canApprove = can(user.role, 'expenses.approve');

  const expensesTotal = monthExpenses.reduce((s, g) => s.plus(dec(g._sum.amount ?? 0)), dec(0));
  const damageTotal = dec(monthDamage._sum.totalCost ?? 0);
  const recovered = dec(monthPenalties._sum.amount ?? 0);

  // Revenue and manufacturing cost are not yet posted per period, so the
  // panel reports what it genuinely knows — the deductions — and says so
  // rather than showing a net profit built on a guessed revenue.
  const impact = netProfit({
    revenue: 0,
    manufacturingCost: 0,
    secondaryExpenses: expensesTotal,
    damageCost: damageTotal,
    penaltiesRecovered: recovered,
  });

  return (
    <AppShell user={user} title="المصروفات الثانوية">
      <ModuleHeader title="المصروفات الثانوية" count={count} />

      {errKey && ERRORS[errKey] && (
        <p role="alert" className="mb-5 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad">
          {ERRORS[errKey]}
        </p>
      )}

      <section className="erp-card mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-brand">أثر الشهر على صافي الربح</h3>
          <span className="tnum text-xs text-txt-3">{month.key}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Figure label="مصروفات ثانوية معتمدة" value={formatMoney(expensesTotal)} />
          <Figure label="تكلفة هالك معتمدة" value={formatMoney(damageTotal)} />
          <Figure label="جزاءات محصَّلة" value={formatMoney(recovered)} />
          <Figure
            label="إجمالي الخصم من الربح"
            value={formatMoney(dec(impact.netProfit).negated())}
            strong
          />
        </div>

        <p className="mt-3 text-[0.7rem] text-txt-4">
          هذه الخصومات فقط. صافي الربح الكامل يحتاج إيراداً وتكلفة تصنيع مُرحَّلين لكل
          فترة، وهما غير مُرحَّلين بعد — فلا يُعرض رقم صافٍ مبني على إيراد مُفترض.
        </p>

        {monthExpenses.length > 0 && (
          <dl className="mt-4 divide-y divide-line border-t border-line">
            {monthExpenses
              .slice()
              .sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0))
              .map((g) => (
                <div key={g.category} className="flex justify-between gap-4 py-2">
                  <dt className="text-sm text-txt-2">
                    {(EXPENSE_CATEGORY_AR as Record<string, string>)[g.category] ?? g.category}
                  </dt>
                  <dd className="tnum text-sm text-txt">{formatMoney(g._sum.amount ?? 0)}</dd>
                </div>
              ))}
          </dl>
        )}
      </section>

      {canWrite && (
        <section className="erp-card mb-6 p-5">
          <h3 className="mb-4 text-sm font-semibold text-brand">تسجيل مصروف</h3>
          <ExpenseForm
            action={createExpense}
            today={dateInput(new Date())}
            employees={employees.map((e) => ({ value: e.id, label: e.nameAr ?? e.name }))}
          />
        </section>
      )}

      <Toolbar placeholder="ابحث بالرقم أو الملاحظات…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/expenses"
          className={
            statusFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <Link
            key={s}
            href={`/expenses?status=${s}`}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {APPROVAL_STATUS_AR[s]}
          </Link>
        ))}
      </div>

      <Table
        headers={['الرقم', 'التاريخ', 'البند', 'المبلغ', 'الموظف', 'سجّله', 'الحالة', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
              {row.number}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">
              {row.expenseDate.toLocaleDateString('ar-EG')}
            </td>
            <td className="px-4 py-3 text-txt-2">
              {(EXPENSE_CATEGORY_AR as Record<string, string>)[row.category] ?? row.category}
            </td>
            <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(row.amount)}</td>
            <td className="px-4 py-3 text-txt-3">
              {row.employee ? (row.employee.nameAr ?? row.employee.name) : '—'}
            </td>
            <td className="px-4 py-3 text-txt-3">
              {row.createdBy ? (row.createdBy.nameAr ?? row.createdBy.name) : '—'}
            </td>
            <td className="px-4 py-3">
              <Badge
                tone={
                  row.status === 'APPROVED' ? 'ok' : row.status === 'REJECTED' ? 'bad' : 'muted'
                }
              >
                {(APPROVAL_STATUS_AR as Record<string, string>)[row.status] ?? row.status}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap justify-end gap-1.5">
                {canApprove && row.status === 'PENDING' && (
                  <>
                    <form action={setExpenseStatus.bind(null, row.id, 'APPROVED')}>
                      <button type="submit" className="text-[0.7rem] text-ok hover:underline">
                        اعتماد
                      </button>
                    </form>
                    <form action={setExpenseStatus.bind(null, row.id, 'REJECTED')}>
                      <button type="submit" className="text-[0.7rem] text-bad hover:underline">
                        رفض
                      </button>
                    </form>
                  </>
                )}
                {canWrite && row.status !== 'APPROVED' && (
                  <form action={deleteExpense.bind(null, row.id)}>
                    <button type="submit" className="text-[0.7rem] text-txt-4 hover:underline">
                      حذف
                    </button>
                  </form>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/expenses" query={query} count={count} />
    </AppShell>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-[0.7rem] text-txt-3">{label}</p>
      <p className={`tnum mt-1 ${strong ? 'text-lg font-semibold text-brand' : 'text-base text-txt'}`}>
        {value}
      </p>
    </div>
  );
}
