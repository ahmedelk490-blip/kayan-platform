import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  can,
  dec,
  formatMoney,
  netProfit,
  monthlySeries,
  EXPENSE_CATEGORY_AR,
  EXPENSE_CATEGORIES,
  APPROVAL_STATUS_AR,
  type ExpenseCategory,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Pager, Badge } from '@/components/crud/Shell';
import { StatCard } from '@/components/dashboard/StatCard';
import { IconCategory, IconClock, IconActivity } from '@/components/dashboard/Icons';
import { BarChartInteractive } from '@/components/dashboard/BarChartInteractive';
import { DonutChartInteractive } from '@/components/dashboard/DonutChartInteractive';
import { Toolbar } from '@/components/crud/Toolbar';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { monthRange, dateInput } from '@/lib/ops';
import { ExpenseForm } from './ExpenseForm';
import { RecurringForm } from './RecurringForm';
import { createExpense, setExpenseStatus, deleteExpense, deleteRecurring, postRecurring, addRecurring } from './actions';

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

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const statusFilter = one(params.status) || undefined;
  const errKey = Array.isArray(params.err) ? params.err[0] : params.err;

  // مدى التاريخ: من–إلى إن صحّا، وإلا الشهر المختار، وإلا كل هذه السنة.
  const rawFrom = one(params.from);
  const rawTo = one(params.to);
  const rawMonth = one(params.month);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  let range: { from: Date; to: Date; label: string; custom: boolean };
  const cf = new Date(`${rawFrom}T00:00:00`);
  const ct = new Date(`${rawTo}T23:59:59.999`);
  if (rawFrom && rawTo && !Number.isNaN(cf.getTime()) && !Number.isNaN(ct.getTime()) && cf <= ct) {
    range = { from: cf, to: ct, label: `${rawFrom} ← ${rawTo}`, custom: true };
  } else if (rawMonth) {
    const m = monthRange(rawMonth);
    range = { from: m.from, to: m.to, label: m.key, custom: false };
  } else {
    range = {
      from: new Date(now.getFullYear(), 0, 1),
      to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      label: `${now.getFullYear()}`,
      custom: false,
    };
  }

  const where: Prisma.SecondaryExpenseWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    expenseDate: { gte: range.from, lte: range.to },
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(query.q ? { OR: [{ number: { contains: query.q } }, { notes: { contains: query.q } }] } : {}),
  };

  const [rows, count, employees, monthExpenses, monthDamage, monthPenalties, categoryChips, rangeTotal, approvedForChart, pendingAgg, recurring] = await Promise.all([
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
        expenseDate: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
    }),
    prisma.damageRecord.aggregate({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        damageDate: { gte: range.from, lte: range.to },
      },
      _sum: { totalCost: true },
    }),
    prisma.penalty.aggregate({
      where: {
        tenantId: user.tenantId,
        status: 'PAID',
        paidAt: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
    }),
    // شرايح التصنيفات: المصروفات المعتمدة فقط في المدى — ما صُرِف فعلاً.
    prisma.secondaryExpense.groupBy({
      by: ['category'],
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        expenseDate: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.secondaryExpense.aggregate({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        expenseDate: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // المعتمد شهرياً للرسم البياني.
    prisma.secondaryExpense.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        expenseDate: { gte: range.from, lte: range.to },
      },
      select: { amount: true, expenseDate: true },
    }),
    // بانتظار الاعتماد في المدى — لعرضه منفصلاً (ليس صرفاً بعد).
    prisma.secondaryExpense.aggregate({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'PENDING',
        expenseDate: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // قوالب المصروفات الثابتة.
    prisma.recurringExpense.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
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

  // المعتمد (ما صُرِف فعلاً) والمعلّق (بانتظار الاعتماد) — منفصلان فلا يختلطان.
  const approvedTotal = dec(rangeTotal._sum.amount ?? 0);
  const pendingTotal = dec(pendingAgg._sum.amount ?? 0);

  // سلسلة شهرية للمعتمد + دائرة التوزيع حسب البند — تفاعلية.
  const series = monthlySeries(
    approvedForChart.map((e) => ({ date: e.expenseDate as Date, amount: e.amount })),
    range.from,
    range.to,
  );
  const chartPoints = series.map((p) => ({ label: p.key, value: p.value.toNumber(), display: formatMoney(p.value) }));
  const donutPoints = categoryChips
    .slice()
    .sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0))
    .map((g) => ({
      label: (EXPENSE_CATEGORY_AR as Record<string, string>)[g.category] ?? g.category,
      value: Number(g._sum.amount ?? 0),
      display: formatMoney(g._sum.amount ?? 0),
    }));

  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const categoryOptions = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_AR[c as ExpenseCategory] }));
  const recurringTotal = recurring.filter((r) => r.isActive).reduce((s, r) => s.plus(dec(r.amount)), dec(0));

  return (
    <AppShell user={user} title="المصروفات الثانوية">
      <ModuleHeader title="المصروفات الثانوية" count={count} />

      {errKey && ERRORS[errKey] && (
        <p role="alert" className="mb-5 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad">
          {ERRORS[errKey]}
        </p>
      )}

      {/* فلتر المدى: من–إلى بأي تاريخ + المدى المطبّق. */}
      <form method="get" action="/expenses" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-card-2 p-3">
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <label className="block">
          <span className="mb-1 block text-[0.7rem] text-txt-3">من</span>
          <input type="date" name="from" defaultValue={rawFrom} dir="ltr" className="erp-input py-2 text-start" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.7rem] text-txt-3">إلى</span>
          <input type="date" name="to" defaultValue={rawTo} dir="ltr" className="erp-input py-2 text-start" />
        </label>
        <button type="submit" className="erp-btn py-2">تطبيق</button>
        <Link href="/expenses" className="erp-btn-ghost py-2">مسح</Link>
        <span className="self-center text-[0.7rem] text-brand">المدى: {range.label}</span>
      </form>

      {/* أرقام حيّة بأيقونات (المعتمد فقط = ما صُرِف فعلاً) — بأسلوب لوحة المدير. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          index={0}
          label="المصروفات المعتمدة"
          value={formatMoney(approvedTotal)}
          hint={`${rangeTotal._count._all} مصروف · ${range.label}`}
          icon={<IconCategory />}
          tone="primary"
        />
        <StatCard
          index={1}
          label="بانتظار الاعتماد"
          value={formatMoney(pendingTotal)}
          hint={`${pendingAgg._count._all} مصروف — لا يُخصَم قبل الاعتماد`}
          icon={<IconClock />}
          tone={pendingTotal.gt(0) ? 'warning' : 'success'}
        />
        <StatCard
          index={2}
          label="الثابتة الشهرية"
          value={formatMoney(recurringTotal)}
          hint={`${recurring.filter((r) => r.isActive).length} بند ثابت نشط`}
          icon={<IconActivity />}
          tone="neutral"
        />
      </div>

      {/* تسجيل مصروف — الفعل اليومي الأول، فصار أول ما تقع عليه اليد. */}
      {canWrite && (
        <section className="erp-card mb-6 border-s-4 border-s-brand p-5">
          <h3 className="mb-4 text-sm font-semibold text-brand">➕ تسجيل مصروف جديد</h3>
          <ExpenseForm
            action={createExpense}
            today={dateInput(new Date())}
            employees={employees.map((e) => ({ value: e.id, label: e.nameAr ?? e.name }))}
          />
        </section>
      )}

      {/* التحليل مطويّ — الرسوم والتوزيع لمن يدقّق، بلا إطالة الشاشة اليومية. */}
      <details className="erp-card mb-6 px-5 py-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-brand">
          📊 التحليل والتوزيع — {range.label}
        </summary>
        <div className="mt-5 space-y-6">
      {approvedTotal.gt(0) && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <section className="erp-card p-6">
            <h3 className="mb-4 text-sm font-semibold text-brand">المصروفات المعتمدة شهرياً</h3>
            {chartPoints.every((p) => p.value === 0) ? (
              <p className="py-8 text-center text-sm text-txt-3">لا مصروفات معتمدة في المدى.</p>
            ) : (
              <BarChartInteractive points={chartPoints} />
            )}
          </section>
          <section className="erp-card p-6">
            <h3 className="mb-4 text-sm font-semibold text-brand">التوزيع حسب البند</h3>
            {donutPoints.length > 0 ? <DonutChartInteractive points={donutPoints} /> : <p className="py-8 text-center text-sm text-txt-3">لا بيانات.</p>}
          </section>
        </div>
      )}

      {/* شرايح التصنيفات — كل بند بعدده ومبلغه (معتمد)، بسيطة كالمرجع. */}
      {categoryChips.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2.5">
          {categoryChips
            .slice()
            .sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0))
            .map((g) => (
              <div key={g.category} className="rounded-xl border border-line bg-card px-4 py-2.5">
                <p className="text-[0.7rem] text-txt-3">
                  {(EXPENSE_CATEGORY_AR as Record<string, string>)[g.category] ?? g.category} ({g._count._all})
                </p>
                <p className="tnum text-sm font-semibold text-txt">{formatMoney(g._sum.amount ?? 0)}</p>
              </div>
            ))}
        </div>
      )}

        </div>
      </details>

      {/* الثابتة الشهرية مطويّة — تُفتح مرة بالشهر لتسجيلها بضغطة. */}
      {canWrite && (
        <details className="erp-card mb-6 px-5 py-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-brand">
            📅 المصروفات الثابتة الشهرية — {recurring.filter((r) => r.isActive).length} بند نشط
          </summary>
          <div className="mt-4">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="sr-only">المصروفات الثابتة (تُخصَم كل شهر)</h3>
            {recurring.some((r) => r.isActive) && (
              <form action={postRecurring.bind(null, thisMonthKey)}>
                <button type="submit" className="erp-btn py-2 text-xs">سجّل مصروفات هذا الشهر ({thisMonthKey})</button>
              </form>
            )}
          </div>

          {recurring.length > 0 && (
            <ul className="mb-4 space-y-2">
              {recurring.map((r) => (
                <li key={r.id} className={`flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-2.5 ${r.isActive ? 'bg-card-2' : 'opacity-55'}`}>
                  <span className="text-sm text-txt">
                    {r.nameAr}
                    <span className="ms-2 text-[0.7rem] text-txt-4">
                      {(EXPENSE_CATEGORY_AR as Record<string, string>)[r.category] ?? r.category}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="tnum text-sm font-semibold text-brand">{formatMoney(r.amount)}</span>
                    <form action={deleteRecurring.bind(null, r.id)}>
                      <button type="submit" className="text-[0.7rem] text-bad hover:underline">حذف</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line pt-4">
            <RecurringForm action={addRecurring} categories={categoryOptions} />
          </div>
          <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
            «سجّل مصروفات هذا الشهر» يُنشئ مصروفاً لكل بند ثابت نشط، مرة واحدة للشهر (لا يتكرّر لو
            ضغطته مرتين). يُخصَم فور تسجيله لأنك تملك اعتماد المصروفات.
          </p>
        </section>
          </div>
        </details>
      )}

      {/* أثر الربح مطويّ — أربعة أرقام لمن يدقّق. */}
      <details className="erp-card mb-6 px-5 py-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-brand">
          💰 أثر المدى على صافي الربح — {range.label}
        </summary>
        <div className="mt-4">
      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="sr-only">أثر المدى على صافي الربح (المعتمد فقط)</h3>
          <span className="tnum text-xs text-txt-3">المعتمد فقط · {range.label}</span>
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
          هذه الخصومات المعتمدة فقط. توزيع كل المصروفات حسب البند في شرايح التحليل.
        </p>
      </section>
        </div>
      </details>

      <h3 className="mb-3 text-sm font-semibold text-brand">🧾 سجل المصروفات</h3>
      <Toolbar placeholder="ابحث بالرقم أو الملاحظات…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/expenses" className={statusFilter ? 'erp-pill' : 'erp-pill-active'}>
          الكل
        </Link>
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <Link
            key={s}
            href={`/expenses?status=${s}`}
            className={statusFilter === s ? 'erp-pill-active' : 'erp-pill'}
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

