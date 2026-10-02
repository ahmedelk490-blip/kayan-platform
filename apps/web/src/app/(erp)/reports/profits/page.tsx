import type { Metadata } from 'next';
import Link from 'next/link';
import { dec, formatMoney, balance, RECEIVABLE_STATUSES } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { realProfit } from '@/lib/profit';
import { returnsByInvoice, netOwed } from '@/lib/receivables';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { StatCard } from '@/components/dashboard/StatCard';
import type { SearchParams } from '@/lib/query';
import { ReportFilter } from '../Shell';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'الأرباح' };

type Dec = ReturnType<typeof dec>;

/** رقم العدّاد بالدينار الكامل — لا كسور (قاعدة المالك). */
const whole = (d: Dec) => Math.round(d.toNumber());

/**
 * الأرباح — صفحة المالك، بثلاثة أقسام (بطلبه: «تبسيط وتقسيم»).
 *
 * ١. النتيجة: ربحٌ أم خسارة، وكم، وأين ذهبت كل 100 دينار.
 * ٢. كيف تكوّن الربح: قائمةٌ واحدة من المبيعات إلى الصافي — كانت تسع بطاقات
 *    متجاورة يجمعها القارئ بعينه.
 * ٣. فلوسك الآن: أربعة عدّادات — المقبوض، ولنا، وعلينا، والمخزون.
 *
 * الأرقام من lib/profit — مصدر التقرير المالي والبيان المالي نفسه — فلا يخرج
 * ربحان لمدةٍ واحدة. وهي للمدير وحده: cost.view (التكلفة شأن المالك).
 */
export default async function ProfitsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('cost.view');
  const range = resolveRange(await searchParams);
  const { from, to } = range;

  const [rp, collectedAgg, receivable, payables, stock] = await Promise.all([
    realProfit(user.tenantId, from, to),
    // ما دخل الصندوق فعلاً في المدة — الدفعات العاكسة سالبة فتُخصم وحدها.
    prisma.payment.aggregate({
      where: { tenantId: user.tenantId, paidAt: { gte: from, lte: to }, invoice: { isDeleted: false } },
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
      select: { id: true, total: true, paidAmount: true },
    }),
    // ما علينا للمورّدين — كشاشة المشتريات: لكل أمرٍ على حدة، بقاعٍ عند الصفر.
    prisma.purchaseOrder.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED'] },
      },
      select: { total: true, paidAmount: true },
    }),
    prisma.stock.findMany({
      where: { variant: { product: { tenantId: user.tenantId } } },
      select: { onHand: true, variant: { select: { cost: true, product: { select: { cost: true } } } } },
    }),
  ]);

  // لنا عند الزبائن بعد المرتجعات — كما يحسبه التقرير المالي ولوحة المدير.
  const invoiceReturns = await returnsByInvoice(user.tenantId, receivable.map((i) => i.id));
  const owedToUs = receivable.reduce(
    (s, i) => s.plus(balance(netOwed(i, invoiceReturns), i.paidAmount)),
    dec(0),
  );
  const weOwe = payables.reduce((s, o) => s.plus(balance(o.total, o.paidAmount)), dec(0));
  const inventoryValue = stock.reduce((s, r) => {
    const unit = r.variant.cost ?? r.variant.product.cost ?? null;
    return unit === null ? s : s.plus(dec(r.onHand).times(dec(unit)));
  }, dec(0));
  const collected = dec(collectedAgg._sum.amount ?? 0);

  const netSales = rp.sales.minus(rp.returns);
  const margin = netSales.gt(0) ? Math.round(rp.grossProfit.dividedBy(netSales).times(100).toNumber()) : 0;
  const obligations = rp.salaries.plus(rp.fixed).plus(rp.bonuses);

  // كل 100 دينار دخلت: أين ذهبت، وكم بقي.
  const base = rp.sales.plus(rp.penalties);
  const pct = (v: Dec) =>
    base.lte(0) ? 0 : Math.max(0, Math.min(100, Math.round(v.dividedBy(base).times(100).toNumber())));
  const parts = [
    { label: 'تكلفة البضاعة', amount: rp.cogs, tone: 'bg-brand' },
    { label: 'المصروفات', amount: rp.expenses, tone: 'bg-warn' },
    { label: 'الرواتب والالتزامات', amount: obligations, tone: 'bg-bad' },
    { label: 'المرتجعات والهالك', amount: rp.returns.plus(rp.damage), tone: 'bg-txt-4' },
  ].filter((p) => p.amount.gt(0));
  const kept = rp.net.gt(0) ? pct(rp.net) : 0;
  const loss = rp.net.lt(0);
  const biggest = [...parts].sort((a, b) => b.amount.minus(a.amount).toNumber())[0];
  const fixedNote =
    rp.fixedNames.length > 0
      ? `حصّة المدة · ${rp.fixedNames.slice(0, 2).join('، ')}${rp.fixedNames.length > 2 ? '…' : ''}`
      : 'حصّة المدة';

  return (
    <AppShell user={user} title="الأرباح">
      <ModuleHeader
        title="الأرباح"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/catalog/costs" className="erp-btn-ghost">
              الأسعار والتكاليف
            </Link>
            <Link href={`/reports/financial?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">
              التفصيل الكامل
            </Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/profits" period={range.period} from={range.fromStr} to={range.toStr} tabs={false} />

      {/* ١. النتيجة — ربحٌ أم خسارة، وكم، وأين ذهبت كل 100 دينار. */}
      <section
        className={`erp-card mb-6 border-s-4 p-5 lg:p-6 ${loss ? 'border-s-bad bg-bad-soft/30' : 'border-s-ok bg-ok-soft/30'}`}
      >
        <p className="text-xs text-txt-2">
          {loss ? 'خسارة في هذه المدة' : 'صافي الربح في هذه المدة'} ·{' '}
          <span className="tnum">
            {range.fromStr} ← {range.toStr}
          </span>
        </p>
        <p className={`tnum mt-1 text-3xl font-bold lg:text-4xl ${loss ? 'text-bad' : 'text-ok'}`}>
          {formatMoney(rp.net)} <span className="text-base font-medium">د.ع</span>
        </p>
        {kept > 0 && (
          <p className="mt-1 text-xs text-txt-3">
            من كل <span className="tnum">100</span> دينار مبيعات بقي لك <strong className="tnum">{kept}</strong> ديناراً.
          </p>
        )}

        {/* في الخسارة لا معنى لـ«أين ذهبت كل 100 دينار» — ذهب أكثر منها؛
            يُقال أكبر بندٍ أوصل إليها بدل نسبٍ تتجاوز المئة. */}
        {loss && biggest && (
          <p className="mt-1 text-xs text-txt-3">
            ما خرج أكثر مما دخل — وأكبر الخارج {biggest.label}: <span className="tnum">{formatMoney(biggest.amount)}</span> د.ع.
          </p>
        )}

        {base.gt(0) && !loss && (
          <>
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-card-2">
              {parts.map((p) => (
                <span
                  key={p.label}
                  title={`${p.label} ${formatMoney(p.amount)}`}
                  style={{ width: `${pct(p.amount)}%` }}
                  className={p.tone}
                />
              ))}
              {kept > 0 && <span style={{ width: `${kept}%` }} className="bg-ok" title="الربح" />}
            </div>
            {/* المفتاح بلا بنودٍ نصيبها دون 1% — «0%» بجانب اسمٍ يشوّش ولا يُخبر. */}
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-txt-3">
              {parts
                .filter((p) => pct(p.amount) >= 1)
                .map((p) => (
                  <li key={p.label} className="flex items-center gap-1.5">
                    <span aria-hidden className={`h-2 w-2 rounded-sm ${p.tone}`} />
                    {p.label} <span className="tnum">{pct(p.amount)}%</span>
                  </li>
                ))}
              {kept > 0 && (
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-sm bg-ok" />
                  الربح <span className="tnum">{kept}%</span>
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      {/* ٢. كيف تكوّن الربح — قائمةٌ واحدة تُقرأ من أعلى لأسفل. */}
      <section className="erp-card mb-6 p-5 lg:p-6">
        <h3 className="text-sm font-semibold text-brand">كيف تكوّن الربح</h3>
        <p className="mb-2 text-[0.7rem] text-txt-4">من المبيعات إلى الصافي، خطوةً خطوة.</p>
        <dl>
          <Step sign="+" label="المبيعات" note={`${rp.invoiceCount} فاتورة · ${rp.pieces} قطعة`} value={rp.sales} />
          {rp.returns.gt(0) && <Step sign="−" label="المرتجعات" note={`${rp.returnsCount} مرتجع`} value={rp.returns} />}
          <Step sign="−" label="تكلفة البضاعة" note={`${rp.pieces} قطعة × تكلفة القطعة`} value={rp.cogs} />
          <Step sign="=" label="مجمل الربح" note={`هامش ${margin}%`} value={rp.grossProfit} total />
          <Step sign="−" label="المصروفات" note={`${rp.expensesCount} مصروف معتمد`} value={rp.expenses} />
          <Step sign="−" label="الرواتب" note={`حصّة المدة · ${rp.staffCount} موظف`} value={rp.salaries} />
          {rp.fixed.gt(0) && <Step sign="−" label="الالتزامات الثابتة" note={fixedNote} value={rp.fixed} />}
          {rp.bonuses.gt(0) && <Step sign="−" label="مكافآت وعمولات" note={`${rp.bonusesCount} دفعة`} value={rp.bonuses} />}
          {rp.damage.gt(0) && <Step sign="−" label="الهالك" note={`${rp.damageCount} محضر`} value={rp.damage} />}
          {rp.penalties.gt(0) && <Step sign="+" label="جزاءات مستردّة" note="من المتسبّبين في الهالك" value={rp.penalties} />}
          <Step sign="=" label="صافي الربح" value={rp.net} total big />
        </dl>
      </section>

      {/* ٣. فلوسك الآن — أربعة عدّادات. */}
      <section className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-brand">فلوسك الآن</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard
            index={0}
            label="المقبوض في المدة"
            value={whole(collected)}
            unit="د.ع"
            hint="ما دخل الصندوق"
            icon={<Emoji>💵</Emoji>}
            tone="success"
          />
          <StatCard
            index={1}
            label="لنا عند الزبائن"
            value={whole(owedToUs)}
            unit="د.ع"
            hint="غير المحصَّل — كل الفترات"
            icon={<Emoji>📥</Emoji>}
          />
          <StatCard
            index={2}
            label="علينا للمورّدين"
            value={whole(weOwe)}
            unit="د.ع"
            hint="غير المدفوع من المشتريات"
            icon={<Emoji>📤</Emoji>}
            tone="neutral"
          />
          <StatCard
            index={3}
            label="قيمة المخزون"
            value={whole(inventoryValue)}
            unit="د.ع"
            hint="الرصيد الحالي بالتكلفة"
            icon={<Emoji>🏷️</Emoji>}
            tone="neutral"
          />
        </div>
      </section>

      {/* قطعٌ بلا تكلفة تُحسب صفراً فتنفخ الربح — تُسمّى بدل أن تمرّ بصمت. */}
      {rp.missingCost.pieces > 0 && (
        <p className="mb-4 rounded-lg border border-warn bg-warn-soft px-4 py-2.5 text-xs leading-[1.9] text-warn">
          ⚠ {rp.missingCost.pieces} قطعة بيعت بلا تكلفة مسجّلة ({rp.missingCost.products.slice(0, 4).join('، ')}
          {rp.missingCost.products.length > 4 ? '…' : ''}) — حُسبت تكلفتها صفراً، فالربح أعلى من حقيقته حتى
          تُسجَّل «تكلفة القطعة» في{' '}
          <Link href="/catalog/costs" className="font-semibold underline">
            «الأسعار والتكاليف»
          </Link>
          .
        </p>
      )}

      <p className="max-w-[75ch] text-[0.7rem] leading-[1.9] text-txt-4">
        الرواتب والالتزامات الثابتة بحصّة أيام المدة من أول فاتورة حتى اليوم. أجور التوصيل على الزبون
        تمرّ للسائق فلا تدخل، والمشتريات تُخصم حين تُباع ضمن تكلفة البضاعة. والأرقام نفسها في التقرير
        المالي والبيان المالي.
      </p>
    </AppShell>
  );
}

/**
 * خطوةٌ في قائمة الربح: داخلٌ (+) أو خارجٌ (−) أو حصيلةٌ (=). الإشارة ملوّنة
 * والرقم هادئ — ستة أرقام حمراء متتالية كانت ستصرخ بلا سبب.
 */
function Step({
  sign,
  label,
  note,
  value,
  total,
  big,
}: {
  sign: '+' | '−' | '=';
  label: string;
  note?: string;
  value: Dec;
  total?: boolean;
  big?: boolean;
}) {
  const signTone = sign === '+' ? 'text-ok' : sign === '−' ? 'text-bad' : 'text-brand';
  const valueTone = value.lt(0) ? 'text-bad' : big ? 'text-ok' : total ? 'text-txt' : 'text-txt-2';
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 ${total ? 'border-t border-line' : ''}`}>
      <dt className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span aria-hidden className={`w-4 shrink-0 text-center text-sm font-bold ${signTone}`}>
          {sign}
        </span>
        <span className={total ? `font-semibold text-txt ${big ? 'text-base' : 'text-sm'}` : 'text-sm text-txt-2'}>
          {label}
        </span>
        {note && <span className="text-[0.7rem] text-txt-4">{note}</span>}
      </dt>
      <dd className={`tnum shrink-0 ${big ? 'text-xl font-bold' : total ? 'text-sm font-bold' : 'text-sm'} ${valueTone}`}>
        {formatMoney(value)}
      </dd>
    </div>
  );
}

function Emoji({ children }: { children: string }) {
  return (
    <span aria-hidden className="text-sm leading-none">
      {children}
    </span>
  );
}
