import Link from 'next/link';
import { PERIODS, PERIOD_AR, type Period } from '@erp/domain';
import { ReportTabs } from './ReportTabs';

/**
 * Shared furniture for the reports.
 *
 * The `Empty` component below is the important one. A report that draws a
 * confident zero when nothing has been recorded is worse than one that says
 * nothing: the zero looks like a measurement, and someone will act on it.
 */

export const REPORTS = [
  { href: '/reports/financial', title: 'التقرير المالي', body: 'المبيعات والمصروفات والصافي والتدفّق النقدي.' },
  { href: '/reports/statement', title: 'البيان المالي', body: 'المبيعات حسب المنتج ناقص التكاليف = الربح الصافي.' },
  { href: '/reports/clients', title: 'تحليل العملاء', body: 'لكل عميل: الفواتير والتحصيل والمتبقّي والربح.' },
  { href: '/reports/client', title: 'تقرير عميل', body: 'اختر عميلاً لعرض تقريره الكامل وفواتيره.' },
  { href: '/reports/aging', title: 'تقدّم الديون', body: 'المستحقات موزّعة حسب مدى تأخّرها.' },
  { href: '/reports/comparison', title: 'مقارنة الفترة', body: 'الفترة الحالية مقابل السابقة ونسبة التغيّر.' },
  { href: '/reports/cashflow', title: 'التدفق النقدي', body: 'الداخل مقابل الخارج والرصيد التراكمي.' },
  { href: '/reports/sales', title: 'المبيعات', body: 'الإيراد والفواتير عبر الفترة.' },
  { href: '/reports/inventory', title: 'تقييم المخزون', body: 'الرصيد الحالي بالتكلفة.' },
  { href: '/reports/production', title: 'إنتاجية التصنيع', body: 'أوامر الإنتاج وزمن الدورة.' },
  { href: '/reports/profitability', title: 'ربحية المنتجات', body: 'الإيراد مقابل التكلفة المحفوظة.' },
  { href: '/reports/employees', title: 'ربحية الموظفين', body: 'ربح كل موظف من فواتيره.' },
] as const;

/**
 * فلتر التقرير: أزرار الفترات الجاهزة + مدى مخصّص (من/إلى) بأي تاريخ.
 *
 * المدى المخصّص نموذج GET بسيط بلا جافاسكربت — يوجّه لنفس الصفحة بـ from/to،
 * فيقرأها resolveRange. يتيح للمالك «من شهر لشهر» أو «من يوم ليوم» بدل
 * الفترات الثابتة.
 */
export function ReportFilter({
  basePath,
  period,
  from,
  to,
}: {
  basePath: string;
  period: Period | null;
  from: string;
  to: string;
}) {
  return (
    <div className="mb-6 space-y-3">
      <ReportTabs />
      <PeriodTabs basePath={basePath} active={period ?? ('' as Period)} />
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-card-2 p-3">
        <label className="block">
          <span className="mb-1 block text-[0.7rem] text-txt-3">من</span>
          <input type="date" name="from" defaultValue={from} dir="ltr" className="erp-input py-2 text-start" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.7rem] text-txt-3">إلى</span>
          <input type="date" name="to" defaultValue={to} dir="ltr" className="erp-input py-2 text-start" />
        </label>
        <button type="submit" className="erp-btn py-2">تطبيق المدى</button>
        {period === null && (
          <span className="self-center text-[0.7rem] text-brand">مدى مخصّص مطبّق</span>
        )}
      </form>
    </div>
  );
}

export function PeriodTabs({ basePath, active }: { basePath: string; active: Period }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {PERIODS.map((p) => (
        <Link
          key={p}
          href={`${basePath}?period=${p}`}
          className={
            p === active
              ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
              : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
          }
        >
          {PERIOD_AR[p]}
        </Link>
      ))}
    </div>
  );
}

export function Figure({
  label,
  value,
  hint,
  strong,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  tone?: 'warn' | 'bad';
}) {
  return (
    <div className="erp-card p-5">
      <p className="text-[0.7rem] text-txt-3">{label}</p>
      <p
        className={`tnum mt-1.5 ${strong ? 'text-xl font-semibold' : 'text-lg'} ${
          tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-brand'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[0.7rem] text-txt-4">{hint}</p>}
    </div>
  );
}

/**
 * Shown instead of a total when nothing was recorded.
 *
 * Deliberately not a zero. "Nothing sold" and "nothing entered" produce the
 * same number and demand opposite responses, so the report refuses to guess
 * which one the reader is looking at.
 */
export function Empty({ what }: { what: string }) {
  return (
    <div className="erp-card p-8 text-center">
      <p className="text-sm text-txt-2">لا توجد {what} في هذه الفترة.</p>
      <p className="mt-2 text-[0.7rem] text-txt-4">
        هذا ليس صفراً محسوباً — لا توجد سجلات أصلاً. الرقم الصفري والسجل الغائب يقودان
        إلى قرارين مختلفين، فلا يُعرض أحدهما مكان الآخر.
      </p>
    </div>
  );
}

/** A bar row. Width is a transform-free percentage, so no layout thrash. */
export function Bar({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="grid grid-cols-[7rem_1fr_7rem] items-center gap-3 py-1.5">
      <span className="tnum text-[0.7rem] text-txt-3">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-card-2">
        <span
          className="block h-full rounded-full bg-brand"
          style={{ width: `${Math.max(percent, 0)}%` }}
        />
      </span>
      <span className="tnum text-end text-xs text-txt-2">{value}</span>
    </div>
  );
}
