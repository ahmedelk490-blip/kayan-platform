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
import { realProfit } from '@/lib/profit';
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


/**
 * التقرير المالي — الداخل والخارج للفترة.
 *
 * المبيعات المفوترة (فواتير صادرة) مقابل المصروفات المعتمدة، مع المحصَّل
 * والمستحق. «الصافي» السريع مبيعاتٌ ناقص مصروفات لا أكثر؛ والربح الحقيقي —
 * بعد تكلفة البضاعة والتشغيل والرواتب والالتزامات — في بطاقته (lib/profit).
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

  const [invoices, lines, receivable, expenses, rp] = await Promise.all([
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
    // الربح الحقيقي بتفصيله — مصدرٌ واحد للشاشة وملف التصدير (lib/profit).
    realProfit(user.tenantId, from, to),
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

  // الربح الحقيقي (lib/profit): البضاعة، فالتشغيل، فالالتزامات — ترتيب سؤال
  // المالك نفسه. والشريط يُري نصيب كل كلفةٍ مما دخل، والباقي ربح.
  const costRows = [
    { key: 'cogs', label: 'تكلفة البضاعة', amount: rp.cogs, tone: 'bg-brand' },
    { key: 'expenses', label: 'المصروفات التشغيلية', amount: rp.expenses, tone: 'bg-warn' },
    { key: 'obligations', label: 'الرواتب والالتزامات', amount: rp.salaries.plus(rp.fixed).plus(rp.bonuses), tone: 'bg-bad' },
    { key: 'returns', label: 'المرتجعات', amount: rp.returns, tone: 'bg-txt-3' },
    { key: 'damage', label: 'الهالك', amount: rp.damage, tone: 'bg-txt-4' },
  ].filter((r) => r.amount.gt(0));

  // المقياس = كل ما دخل (مبيعات البضاعة + جزاءات مستردّة). النسب منه، وإلا
  // تجاوز مجموع الشرائح مئةً حين تُسترَدّ جزاءات.
  const moneyIn = rp.sales.plus(rp.penalties);
  const share = (v: ReturnType<typeof dec>) =>
    moneyIn.lte(0) ? 0 : Math.max(0, Math.min(100, v.dividedBy(moneyIn).times(100).toNumber()));
  const profitShare = rp.net.gt(0) ? share(rp.net) : 0;
  const netSales = rp.sales.minus(rp.returns);
  const margin = netSales.gt(0) ? Math.round(rp.grossProfit.dividedBy(netSales).times(100).toNumber()) : 0;
  const day = (d: Date) => new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const obligationDays =
    rp.obligationsFrom && rp.obligationsTo
      ? Math.round((rp.obligationsTo.getTime() - rp.obligationsFrom.getTime()) / 86_400_000)
      : 0;

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
              hint="لا يخصم تكلفة البضاعة — الربح الحقيقي في البطاقة أدناه"
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

          {/* الربح الصافي الحقيقي (lib/profit).
              الحكم أولاً ثم القائمة بترتيبها المحاسبي: مبيعات البضاعة − تكلفتها
              = مجمل الربح، ثم التشغيل، ثم الرواتب والالتزامات. كان يخصم أوامر
              الشراء بدل تكلفة البضاعة المباعة فخرج الربح ٩٢٪ من المبيعات. */}
          <section className="erp-card mb-8 overflow-hidden border-s-4 border-s-brand">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-brand">💰 الربح الصافي الحقيقي</h3>
              <span className="tnum text-xs text-txt-3">{range.fromStr} ← {range.toStr}</span>
            </div>

            {/* الحكم: كلمة ورقم — بلا حساب ذهني. */}
            <div className={`px-5 py-5 ${rp.net.lt(0) ? 'bg-bad-soft/40' : 'bg-ok-soft/40'}`}>
              <p className="text-xs font-medium text-txt-2">
                {rp.net.lt(0) ? 'خسارة في هذه الفترة' : rp.net.isZero() ? 'لا ربح ولا خسارة' : 'ربح صافٍ في هذه الفترة'}
              </p>
              <p className={`tnum mt-1 text-3xl font-bold ${rp.net.lt(0) ? 'text-bad' : 'text-ok'}`}>
                {formatMoney(rp.net)} <span className="text-base font-medium">د.ع</span>
              </p>
              {moneyIn.gt(0) && rp.net.gt(0) && (
                <p className="mt-1 text-[0.7rem] text-txt-3">
                  من كل <span className="tnum">100</span> دينار مبيعات، بقي لك{' '}
                  <strong className="tnum">{Math.round(profitShare)}</strong> ديناراً.
                </p>
              )}
            </div>

            {/* شريط واحد: نصيب كل كلفةٍ مما دخل، والباقي ربح. */}
            {moneyIn.gt(0) && (
              <div className="px-5 pt-4">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-card-2">
                  {costRows.map((r) => (
                    <span
                      key={r.key}
                      title={`${r.label} ${formatMoney(r.amount)}`}
                      style={{ width: `${share(r.amount)}%` }}
                      className={r.tone}
                    />
                  ))}
                  {profitShare > 0 && (
                    <span style={{ width: `${profitShare}%` }} className="bg-ok" title="الربح" />
                  )}
                </div>
              </div>
            )}

            <dl className="space-y-3 px-5 py-4 text-sm">
              <PnlLine
                kind="in"
                label="مبيعات البضاعة"
                note={
                  rp.deliveryCharged.gt(0)
                    ? `${formatMoney(rp.invoiced)} مفوترة، منها أجور توصيل على الزبون ${formatMoney(rp.deliveryCharged)} تمرّ للسائق`
                    : `${rp.invoiceCount} فاتورة`
                }
                value={rp.sales}
              />
              {rp.returns.gt(0) && (
                <PnlLine label="المرتجعات" note={`${rp.returnsCount} مرتجع`} value={rp.returns} tone="bg-txt-3" />
              )}
              <PnlLine
                label="تكلفة البضاعة المباعة"
                note={`${rp.pieces} قطعة × تكلفة القطعة`}
                value={rp.cogs}
                tone="bg-brand"
              />
              <PnlLine kind="total" label="= مجمل الربح" note={`هامش ${margin}%`} value={rp.grossProfit} />
              <PnlLine
                label="المصروفات التشغيلية المعتمدة"
                note={`${rp.expensesCount} مصروف`}
                value={rp.expenses}
                tone="bg-warn"
              />
              <PnlLine
                label="الرواتب — حصّة الفترة"
                note={
                  rp.staffCount > 0
                    ? `${rp.staffCount} موظف · ${formatMoney(rp.salariesMonthly)} شهرياً`
                    : 'لا رواتب مضبوطة للموظفين'
                }
                value={rp.salaries}
                tone="bg-bad"
              />
              {rp.fixedMonthly.gt(0) && (
                <PnlLine
                  label="الالتزامات الثابتة — حصّة الفترة"
                  note={`${rp.fixedNames.slice(0, 3).join('، ')}${rp.fixedNames.length > 3 ? '…' : ''} · ${formatMoney(rp.fixedMonthly)} شهرياً`}
                  value={rp.fixed}
                  tone="bg-bad"
                />
              )}
              {rp.bonuses.gt(0) && (
                <PnlLine label="مكافآت وعمولات مصروفة" note={`${rp.bonusesCount} دفعة`} value={rp.bonuses} tone="bg-bad" />
              )}
              {rp.damage.gt(0) && (
                <PnlLine label="الهالك المعتمد" note={`${rp.damageCount} محضر`} value={rp.damage} tone="bg-txt-4" />
              )}
              {rp.penalties.gt(0) && (
                <PnlLine kind="in" label="جزاءات محصَّلة" note="استُردّت من المتسبّبين" value={rp.penalties} />
              )}
              <PnlLine kind="net" label="= صافي الربح" value={rp.net} />
            </dl>

            {/* قطعٌ بلا تكلفة تُحسب صفراً فتنفخ الربح — تُسمّى بدل أن تمرّ بصمت. */}
            {rp.missingCost.pieces > 0 && (
              <p className="mx-5 mb-4 rounded-lg border border-warn bg-warn-soft px-4 py-2.5 text-[0.7rem] leading-[1.9] text-warn">
                ⚠ {rp.missingCost.pieces} قطعة بيعت بلا تكلفة مسجّلة (
                {rp.missingCost.products.slice(0, 4).join('، ')}
                {rp.missingCost.products.length > 4 ? '…' : ''}) — حُسبت تكلفتها صفراً، فالربح أعلى من
                حقيقته حتى تُسجَّل «تكلفة القطعة» في{' '}
                <Link href="/catalog/products" className="font-semibold underline">
                  بطاقة المنتج
                </Link>
                .
              </p>
            )}

            <p className="border-t border-line px-5 py-3 text-[0.7rem] leading-[1.8] text-txt-4">
              تكلفة البضاعة = القطع المباعة × تكلفة القطعة من بطاقة المنتج، ناقص ما رجع منها. الرواتب
              والالتزامات الثابتة بحصّة الأيام كيومية اليوم
              {rp.obligationsFrom && rp.obligationsTo
                ? ` (${day(rp.obligationsFrom)} ← ${day(rp.obligationsTo)}، ${obligationDays} يوماً — من أول فاتورة وحتى اليوم)`
                : ' (لا فواتير بعد فلا تُحسب)'}
              ، فلا يبدو شهرٌ رابحاً لأن رواتبه لم تُصرف بعد. والمشتريات لا تُخصم هنا: تدخل المخزون
              وتُخصم حين تُباع ضمن تكلفة البضاعة.
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

/** سطرٌ من قائمة الربح: داخلٌ (+)، أو كلفةٌ (−) بلون شريطها، أو مجموعٌ (=). */
function PnlLine({
  label,
  note,
  value,
  kind = 'out',
  tone,
}: {
  label: string;
  note?: string;
  value: ReturnType<typeof dec>;
  kind?: 'in' | 'out' | 'total' | 'net';
  tone?: string;
}) {
  const sum = kind === 'total' || kind === 'net';
  const valueClass =
    kind === 'in'
      ? 'font-semibold text-ok'
      : kind === 'out'
        ? 'text-bad'
        : `font-bold ${kind === 'net' ? 'text-xl' : ''} ${value.lt(0) ? 'text-bad' : kind === 'net' ? 'text-ok' : 'text-txt'}`;
  return (
    <div className={`flex items-baseline justify-between gap-4 ${sum ? 'border-t border-line pt-3' : ''}`}>
      <dt className="flex min-w-0 flex-wrap items-center gap-x-2 text-txt-2">
        {tone && <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${tone}`} />}
        <span className={sum ? `font-bold text-txt ${kind === 'net' ? 'text-base' : ''}` : ''}>{label}</span>
        {note && <span className="text-[0.7rem] text-txt-4">({note})</span>}
      </dt>
      <dd className={`tnum shrink-0 ${valueClass}`}>
        {kind === 'out' ? `− ${formatMoney(value)}` : kind === 'in' ? `+ ${formatMoney(value)}` : formatMoney(value)}
      </dd>
    </div>
  );
}
