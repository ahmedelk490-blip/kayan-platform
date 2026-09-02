import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatMoney,
  dec,
  balance,
  monthlySeries,
  RECEIVABLE_STATUSES,
  EXPENSE_CATEGORY_AR,
  type ExpenseCategory,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { DonutChartInteractive } from '@/components/dashboard/DonutChartInteractive';
import { BarChartInteractive } from '@/components/dashboard/BarChartInteractive';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { resolveRange } from '../range';
import { categoryOf } from '@/app/(erp)/returns/category';

export const metadata: Metadata = { title: 'التقرير المالي' };

/**
 * التقرير المالي — الداخل والخارج للفترة.
 *
 * المبيعات المفوترة (فواتير صادرة) مقابل المصروفات المعتمدة، مع المحصَّل
 * والمستحق. ليس ربحاً محاسبياً كاملاً (لا يخصم تكلفة البضاعة المباعة) — لذا
 * يُسمّى «الصافي» صراحةً: مبيعات ناقص مصروفات، لا أكثر.
 */
export default async function FinancialReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const range = resolveRange(params);
  const { from, to } = range;

  const [invoices, lines, receivable, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { notIn: ['DRAFT', 'VOID'] },
        issueDate: { gte: from, lte: to },
      },
      select: { total: true, paidAmount: true, issueDate: true },
    }),
    // بنود فواتير الفترة — لعدد القطع الكلي وتفصيله حسب النوع (يلكات/تيشيرتات…).
    prisma.invoiceLine.findMany({
      where: {
        invoice: {
          tenantId: user.tenantId,
          isDeleted: false,
          status: { notIn: ['DRAFT', 'VOID'] },
          issueDate: { gte: from, lte: to },
        },
      },
      select: { description: true, quantity: true, lineTotal: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
      select: { total: true, paidAmount: true },
    }),
    prisma.secondaryExpense.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        expenseDate: { gte: from, lte: to },
      },
      select: { amount: true, category: true, expenseDate: true },
    }),
  ]);

  // بنود «الربح الصافي الشامل» — كل ما خرج فعلاً في المدى: رواتب ومدفوعات
  // الموظفين، تكلفة الهالك المعتمد، والمشتريات المؤكَّدة؛ والجزاءات المحصَّلة
  // تُردّ للربح لأنها استُرجعت من المتسببين.
  const [salariesAgg, damageAgg, penaltiesAgg, purchasesAgg] = await Promise.all([
    prisma.employeePayment.aggregate({
      where: { tenantId: user.tenantId, isDeleted: false, paidAt: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.damageRecord.aggregate({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        damageDate: { gte: from, lte: to },
      },
      _sum: { totalCost: true },
      _count: { _all: true },
    }),
    prisma.penalty.aggregate({
      where: { tenantId: user.tenantId, status: 'PAID', paidAt: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.purchaseOrder.aggregate({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED'] },
        orderDate: { gte: from, lte: to },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);

  // عدد القطع الكلي + تفصيله حسب النوع بصورة عامة (بلا ألوان وموديلات) —
  // بطلب المالك لحساب عائد الاستثمار لكل صنف عبر أي مدى يختاره.
  const totalPieces = lines.reduce((s, l) => s + Number(l.quantity), 0);
  const families = new Map<string, { pieces: number; value: ReturnType<typeof dec> }>();
  for (const l of lines) {
    const key = categoryOf(l.description);
    const f = families.get(key) ?? { pieces: 0, value: dec(0) };
    f.pieces += Number(l.quantity);
    f.value = f.value.plus(dec(l.lineTotal));
    families.set(key, f);
  }
  const familyRows = [...families.entries()].sort((a, b) => b[1].pieces - a[1].pieces);

  const invoiced = invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoices.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  const outstanding = receivable.reduce((s, i) => s.plus(balance(i.total, i.paidAmount)), dec(0));
  const expenseTotal = expenses.reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const net = invoiced.minus(expenseTotal);
  const cashFlow = collected.minus(expenseTotal);

  // الربح الصافي الشامل: المبيعات ناقص كل ما خرج (مصروفات، رواتب، هالك،
  // مشتريات) زائد الجزاءات المستردّة — بطلب المالك: رقم واحد لأي مدى.
  const salariesOut = dec(salariesAgg._sum.amount ?? 0);
  const damageOut = dec(damageAgg._sum.totalCost ?? 0);
  const penaltiesIn = dec(penaltiesAgg._sum.amount ?? 0);
  const purchasesOut = dec(purchasesAgg._sum.total ?? 0);
  const fullNet = invoiced
    .minus(expenseTotal)
    .minus(salariesOut)
    .minus(damageOut)
    .minus(purchasesOut)
    .plus(penaltiesIn);

  // المصروفات حسب البند.
  const byCategory = new Map<string, ReturnType<typeof dec>>();
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? dec(0)).plus(dec(e.amount)));
  }
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1].minus(a[1]).toNumber());

  // نقاط الدائرة: المصروفات حسب البند، بالاسم العربي والمبلغ المنسّق.
  const donutPoints = categoryRows.map(([cat, amount]) => ({
    label: EXPENSE_CATEGORY_AR[cat as ExpenseCategory] ?? cat,
    value: amount.toNumber(),
    display: formatMoney(amount),
  }));

  // سلاسل شهرية للمبيعات المفوترة والمصروفات — لرسمها كأعمدة تفاعلية.
  const revSeries = monthlySeries(
    invoices.map((i) => ({ date: i.issueDate as Date, amount: i.total })),
    from,
    to,
  );
  const expSeries = monthlySeries(
    expenses.map((e) => ({ date: e.expenseDate as Date, amount: e.amount })),
    from,
    to,
  );
  const revPoints = revSeries.map((p) => ({ label: p.key, value: p.value.toNumber(), display: formatMoney(p.value) }));
  const expPoints = expSeries.map((p) => ({ label: p.key, value: p.value.toNumber(), display: formatMoney(p.value) }));

  const empty = invoices.length === 0 && expenses.length === 0;

  return (
    <AppShell user={user} title="التقرير المالي">
      <ModuleHeader
        title="التقرير المالي"
        action={
          <div className="flex gap-2">
            <a href={`/reports/financial/export?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">
              تصدير Excel
            </a>
            <Link href="/reports" className="erp-btn-ghost">
              كل التقارير
            </Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/financial" period={range.period} from={range.fromStr} to={range.toStr} />

      {empty ? (
        <Empty what="حركة مالية" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="المبيعات المفوترة" value={formatMoney(invoiced)} hint={`${invoices.length} فاتورة · ${totalPieces} قطعة`} strong />
            <Figure label="المحصَّل" value={formatMoney(collected)} hint="من فواتير الفترة" />
            <Figure
              label="المستحق حالياً"
              value={formatMoney(outstanding)}
              hint="كل الفترات"
              tone={dec(outstanding).gt(0) ? 'warn' : undefined}
            />
            <Figure label="المصروفات المعتمدة" value={formatMoney(expenseTotal)} hint={`${expenses.length} مصروف`} />
          </div>

          {/* تفصيل القطع حسب النوع — يلكات وتيشيرتات ومرايل… بصورة عامة، بلا
              ألوان ولا موديلات، للمدى المختار نفسه: أساس عائد الاستثمار. */}
          {familyRows.length > 0 && (
            <section className="erp-card mb-6 p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-brand">تفصيل القطع المباعة حسب النوع</h3>
                <span className="tnum text-xs text-txt-3">
                  {totalPieces} قطعة · {range.fromStr} ← {range.toStr}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-[0.7rem] text-txt-3">
                      <th className="px-3 py-2 text-start font-medium">النوع</th>
                      <th className="px-3 py-2 text-start font-medium">القطع</th>
                      <th className="px-3 py-2 text-start font-medium">القيمة</th>
                      <th className="px-3 py-2 text-start font-medium">نسبة القطع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {familyRows.map(([name, f]) => (
                      <tr key={name} className="border-b border-line/60">
                        <td className="px-3 py-2.5 font-medium text-txt">{name}</td>
                        <td className="tnum px-3 py-2.5 font-semibold text-brand">{f.pieces}</td>
                        <td className="tnum px-3 py-2.5 text-txt-2">{formatMoney(f.value)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-card-2">
                              <div
                                className="h-full rounded-full bg-brand"
                                style={{ width: `${totalPieces > 0 ? Math.round((f.pieces / totalPieces) * 100) : 0}%` }}
                              />
                            </div>
                            <span className="tnum text-[0.7rem] text-txt-3">
                              {totalPieces > 0 ? Math.round((f.pieces / totalPieces) * 100) : 0}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <Figure
              label="الصافي (مبيعات − مصروفات)"
              value={formatMoney(net)}
              hint="لا يخصم تكلفة البضاعة — ليس ربحاً محاسبياً كاملاً"
              strong
              tone={net.lt(0) ? 'bad' : undefined}
            />
            <Figure
              label="التدفّق النقدي (محصَّل − مصروفات)"
              value={formatMoney(cashFlow)}
              hint="النقد الفعلي الداخل ناقص الخارج"
              strong
              tone={cashFlow.lt(0) ? 'bad' : undefined}
            />
          </div>

          {/* الربح الصافي الشامل — كل الالتزامات مخصومة، بنداً بنداً ثم الرقم. */}
          <section className="erp-card mb-8 border-s-4 border-s-brand p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-brand">💰 الربح الصافي الشامل للمدى</h3>
              <span className="tnum text-xs text-txt-3">{range.fromStr} ← {range.toStr}</span>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-txt-2">المبيعات المفوترة</dt>
                <dd className="tnum text-ok">+ {formatMoney(invoiced)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-txt-2">المصروفات المعتمدة</dt>
                <dd className="tnum text-bad">− {formatMoney(expenseTotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-txt-2">الرواتب ومدفوعات الموظفين <span className="text-[0.7rem] text-txt-4">({salariesAgg._count._all} دفعة)</span></dt>
                <dd className="tnum text-bad">− {formatMoney(salariesOut)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-txt-2">تكلفة الهالك المعتمد <span className="text-[0.7rem] text-txt-4">({damageAgg._count._all} محضر)</span></dt>
                <dd className="tnum text-bad">− {formatMoney(damageOut)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-txt-2">المشتريات المؤكَّدة <span className="text-[0.7rem] text-txt-4">({purchasesAgg._count._all} أمر)</span></dt>
                <dd className="tnum text-bad">− {formatMoney(purchasesOut)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-txt-2">جزاءات محصَّلة من الموظفين</dt>
                <dd className="tnum text-ok">+ {formatMoney(penaltiesIn)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-3">
                <dt className="text-base font-bold text-txt">= الربح الصافي الشامل</dt>
                <dd className={`tnum text-xl font-bold ${fullNet.lt(0) ? 'text-bad' : 'text-ok'}`}>
                  {formatMoney(fullNet)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[0.7rem] leading-[1.8] text-txt-4">
              المشتريات تُخصم كإنفاق نقدي في مداها (لا كتكلفة بضاعة مباعة) — فبضاعة اشتريتها
              اليوم وستبيعها الشهر القادم تُخصم اليوم. غيّر المدى أعلاه فيتغيّر كل شيء معه.
            </p>
          </section>

          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <section className="erp-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">المبيعات المفوترة شهرياً</h3>
              {revPoints.every((p) => p.value === 0) ? (
                <p className="py-8 text-center text-sm text-txt-3">لا مبيعات في هذه الفترة.</p>
              ) : (
                <BarChartInteractive points={revPoints} />
              )}
            </section>
            <section className="erp-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">المصروفات شهرياً</h3>
              {expPoints.every((p) => p.value === 0) ? (
                <p className="py-8 text-center text-sm text-txt-3">لا مصروفات في هذه الفترة.</p>
              ) : (
                <BarChartInteractive points={expPoints} />
              )}
            </section>
          </div>

          {donutPoints.length > 0 && (
            <section className="erp-card mb-8 p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">توزيع المصروفات حسب البند</h3>
              <DonutChartInteractive points={donutPoints} />
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">المصروفات حسب البند</h3>
            <Table headers={['البند', 'القيمة']} empty={categoryRows.length === 0}>
              {categoryRows.map(([cat, amount]) => (
                <tr key={cat}>
                  <td className="px-4 py-3 text-txt-2">
                    {EXPENSE_CATEGORY_AR[cat as ExpenseCategory] ?? cat}
                  </td>
                  <td className="tnum px-4 py-3 font-medium text-txt">{formatMoney(amount)}</td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-[0.7rem] text-txt-4">
              المصروفات المعتمدة فقط تدخل الحساب — المصروف بانتظار الاعتماد لا يُحتسب حتى يُعتمد.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
