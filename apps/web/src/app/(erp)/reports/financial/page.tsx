import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatMoney,
  dec,
  balance,
  monthlySeries,
  RECEIVABLE_STATUSES,
  EXPENSE_CATEGORY_AR,
  DEDUCTION_KINDS,
  type ExpenseCategory,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { returnsByInvoice, netOwed } from '@/lib/receivables';
import { isDeliveryDesc } from '@/lib/delivery';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { DonutChartInteractive } from '@/components/dashboard/DonutChartInteractive';
import { BarChartInteractive } from '@/components/dashboard/BarChartInteractive';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { resolveRange } from '../range';
import { categoryOf } from '@/app/(erp)/returns/category';

export const metadata: Metadata = { title: 'التقرير المالي' };

/** ألوان شرائح المصروفات — ثابتة بالترتيب فيطابق لونُ الشريط لونَ بنده. */
const OUTFLOW_TONES = ['bg-brand', 'bg-warn', 'bg-bad', 'bg-txt-3', 'bg-txt-4'];

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
      select: { id: true, total: true, paidAmount: true },
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
  const [salariesAgg, damageAgg, penaltiesAgg, purchasesAgg, returnsAgg] = await Promise.all([
    // الأنواع المدفوعة للموظف فقط (راتب/مكافأة/عمولة). الخصم والخسارة والسلفة
    // مالٌ يعود للشركة لا يخرج منها — جمعُها هنا كان يخصمها من الربح مرتين:
    // مرةً كتكلفة هالك ومرةً كأنها راتب مدفوع.
    prisma.employeePayment.aggregate({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        kind: { notIn: DEDUCTION_KINDS },
        paidAt: { gte: from, lte: to },
      },
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
    // المرتجعات: بضاعة رجعت ومالها رُدّ — تُنقص المبيعات، وغيابها كان يترك
    // فاتورةً رُدَّت بالكامل محسوبةً ربحاً.
    prisma.salesReturn.aggregate({
      where: { tenantId: user.tenantId, isDeleted: false, returnDate: { gte: from, lte: to } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
  ]);

  // عدد القطع الكلي + تفصيله حسب النوع بصورة عامة (بلا ألوان وموديلات) —
  // بطلب المالك لحساب عائد الاستثمار لكل صنف عبر أي مدى يختاره.
  // بند التوصيل 🚚 مالٌ لا بضاعة: يبقى في إجمالي المبيعات ويخرج من عدّ القطع
  // وتحليل العوائل كي لا يشوّه أرقام عائد الاستثمار.
  const totalPieces = lines.reduce(
    (s, l) => (isDeliveryDesc(l.description) ? s : s + Number(l.quantity)),
    0,
  );
  const families = new Map<string, { pieces: number; value: ReturnType<typeof dec> }>();
  for (const l of lines) {
    if (isDeliveryDesc(l.description)) continue;
    const key = categoryOf(l.description);
    const f = families.get(key) ?? { pieces: 0, value: dec(0) };
    f.pieces += Number(l.quantity);
    f.value = f.value.plus(dec(l.lineTotal));
    families.set(key, f);
  }
  const familyRows = [...families.entries()].sort((a, b) => b[1].pieces - a[1].pieces);

  const invoiced = invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoices.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  // المستحق بعد خصم المرتجعات — فاتورةٌ عادت بضاعتها ليست ديناً قائماً.
  const invoiceReturns = await returnsByInvoice(user.tenantId, receivable.map((i) => i.id));
  const outstanding = receivable.reduce(
    (s, i) => s.plus(balance(netOwed(i, invoiceReturns), i.paidAmount)),
    dec(0),
  );
  const expenseTotal = expenses.reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const net = invoiced.minus(expenseTotal);
  const cashFlow = collected.minus(expenseTotal);

  // الربح الصافي الشامل: المبيعات ناقص كل ما خرج (مصروفات، رواتب، هالك،
  // مشتريات) زائد الجزاءات المستردّة — بطلب المالك: رقم واحد لأي مدى.
  const salariesOut = dec(salariesAgg._sum.amount ?? 0);
  const damageOut = dec(damageAgg._sum.totalCost ?? 0);
  const penaltiesIn = dec(penaltiesAgg._sum.amount ?? 0);
  const purchasesOut = dec(purchasesAgg._sum.total ?? 0);
  const returnsOut = dec(returnsAgg._sum.totalAmount ?? 0);

  /**
   * بنود «أين ذهبت المبيعات» — مرتّبةً بالأكبر أولاً لا بترتيبٍ ثابت: أكبر
   * مصرفٍ يجب أن يكون أول ما تقع عليه العين، فهو القرار الذي يستحق النظر.
   */
  const outflowRows = [
    { key: 'purchases', label: 'المشتريات', count: `${purchasesAgg._count._all} أمر`, amount: purchasesOut },
    { key: 'salaries', label: 'الرواتب والمكافآت', count: `${salariesAgg._count._all} دفعة`, amount: salariesOut },
    { key: 'expenses', label: 'المصروفات المعتمدة', count: `${expenses.length} مصروف`, amount: expenseTotal },
    { key: 'returns', label: 'المرتجعات', count: `${returnsAgg._count._all} مرتجع`, amount: returnsOut },
    { key: 'damage', label: 'الهالك المعتمد', count: `${damageAgg._count._all} محضر`, amount: damageOut },
  ]
    .filter((r) => r.amount.gt(0))
    .sort((a, b) => b.amount.minus(a.amount).toNumber());

  // المقياس = كل ما دخل (مبيعات + جزاءات مستردّة). النسب منه، لا من المبيعات
  // وحدها، وإلا تجاوز مجموع الشرائح مئةً حين تُسترَدّ جزاءات.
  const moneyIn = invoiced.plus(penaltiesIn);
  const share = (v: ReturnType<typeof dec>) =>
    moneyIn.lte(0) ? 0 : Math.max(0, Math.min(100, v.dividedBy(moneyIn).times(100).toNumber()));
  const fullNet = invoiced
    .minus(returnsOut)
    .minus(expenseTotal)
    .minus(salariesOut)
    .minus(damageOut)
    .minus(purchasesOut)
    .plus(penaltiesIn);
  const profitShare = fullNet.gt(0) ? share(fullNet) : 0;

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

          {/* الربح الصافي الشامل.
              الحكم أولاً ثم تفسيره: كان سبعة سطورٍ متشابهة يقرؤها المالك كلها
              ليعرف أين ذهب ماله. الآن الرقم وحكمُه في الأعلى، وشريطٌ يُري
              نصيب كل مصرفٍ من المبيعات، والبنود مرتّبةٌ بالأكبر أولاً. */}
          <section className="erp-card mb-8 overflow-hidden border-s-4 border-s-brand">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-brand">💰 الربح الصافي الشامل</h3>
              <span className="tnum text-xs text-txt-3">{range.fromStr} ← {range.toStr}</span>
            </div>

            {/* الحكم: كلمة ورقم — بلا حساب ذهني. */}
            <div className={`px-5 py-5 ${fullNet.lt(0) ? 'bg-bad-soft/40' : 'bg-ok-soft/40'}`}>
              <p className="text-xs font-medium text-txt-2">
                {fullNet.lt(0) ? 'خسارة في هذه الفترة' : fullNet.isZero() ? 'لا ربح ولا خسارة' : 'ربح صافٍ في هذه الفترة'}
              </p>
              <p className={`tnum mt-1 text-3xl font-bold ${fullNet.lt(0) ? 'text-bad' : 'text-ok'}`}>
                {formatMoney(fullNet)} <span className="text-base font-medium">د.ع</span>
              </p>
              {moneyIn.gt(0) && (
                <p className="mt-1 text-[0.7rem] text-txt-3">
                  من كل <span className="tnum">100</span> دينار مبيعات، بقي لك{' '}
                  <strong className="tnum">{Math.round(profitShare)}</strong> ديناراً.
                </p>
              )}
            </div>

            {/* شريط واحد: نصيب كل مصرفٍ من المبيعات، والباقي ربح. */}
            {moneyIn.gt(0) && (
              <div className="px-5 pt-4">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-card-2">
                  {outflowRows.map((r, idx) => (
                    <span
                      key={r.key}
                      title={`${r.label} ${formatMoney(r.amount)}`}
                      style={{ width: `${share(r.amount)}%` }}
                      className={OUTFLOW_TONES[idx % OUTFLOW_TONES.length]}
                    />
                  ))}
                  {profitShare > 0 && (
                    <span style={{ width: `${profitShare}%` }} className="bg-ok" title="الربح" />
                  )}
                </div>
              </div>
            )}

            {/* البنود: الأكبر أولاً، كلٌّ بنسبته من المبيعات. */}
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                <dt className="text-txt-2">
                  المبيعات المفوترة
                  {penaltiesIn.gt(0) && (
                    <span className="text-[0.7rem] text-txt-4"> + جزاءات محصَّلة {formatMoney(penaltiesIn)}</span>
                  )}
                </dt>
                <dd className="tnum font-semibold text-ok">{formatMoney(moneyIn)}</dd>
              </div>

              {outflowRows.length === 0 ? (
                <p className="py-2 text-xs text-txt-4">لا مصروفات ولا مشتريات في هذه الفترة.</p>
              ) : (
                outflowRows.map((r, idx) => (
                  <div key={r.key} className="flex items-baseline justify-between gap-4">
                    <dt className="flex min-w-0 items-center gap-2 text-txt-2">
                      <span
                        aria-hidden
                        className={`h-2.5 w-2.5 shrink-0 rounded-sm ${OUTFLOW_TONES[idx % OUTFLOW_TONES.length]}`}
                      />
                      <span className="truncate">{r.label}</span>
                      <span className="shrink-0 text-[0.7rem] text-txt-4">({r.count})</span>
                    </dt>
                    <dd className="shrink-0 text-end">
                      <span className="tnum text-bad">− {formatMoney(r.amount)}</span>
                      <span className="tnum block text-[0.65rem] text-txt-4">
                        {Math.round(share(r.amount))}% من المبيعات
                      </span>
                    </dd>
                  </div>
                ))
              )}

              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="text-base font-bold text-txt">= الصافي</dt>
                <dd className={`tnum text-xl font-bold ${fullNet.lt(0) ? 'text-bad' : 'text-ok'}`}>
                  {formatMoney(fullNet)}
                </dd>
              </div>
            </dl>

            <p className="border-t border-line px-5 py-3 text-[0.7rem] leading-[1.8] text-txt-4">
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
