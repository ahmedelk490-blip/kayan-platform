import type { Prisma } from '@prisma/client';
import {
  formatMoney,
  formatQty,
  dec,
  COST_CATEGORIES,
  COST_CATEGORY_AR,
  COST_BASIS_AR,
  unpricedLines,
  type CostCategory,
} from '@erp/domain';
import { Table } from '@/components/crud/Shell';

type Calculation = Prisma.CostCalculationGetPayload<{
  include: { lines: true; formulas: true };
}>;

/** Maps each reported bucket to its column on the calculation header. */
const BUCKETS: { category: CostCategory; field: keyof Calculation }[] = [
  { category: 'MATERIAL', field: 'materialCost' },
  { category: 'INK', field: 'inkCost' },
  { category: 'THREAD', field: 'threadCost' },
  { category: 'LABOR', field: 'laborCost' },
  { category: 'PACKAGING', field: 'packagingCost' },
  { category: 'MACHINE', field: 'machineCost' },
  { category: 'OVERHEAD', field: 'overheadCost' },
  { category: 'WASTE', field: 'wasteCost' },
];

/**
 * تفصيل التكلفة — a stored snapshot, rendered.
 *
 * Everything shown here was written at calculation time. Nothing on this
 * component recomputes anything: if a formula changed yesterday, this still
 * shows what the cost was when it was calculated, which is the entire point.
 */
export function CostBreakdown({
  calculation,
  showMargin,
}: {
  calculation: Calculation;
  showMargin: boolean;
}) {
  const buckets = BUCKETS.filter((b) => dec(calculation[b.field] as never).gt(0));

  // A line with real consumption and no price contributes nothing. Saying so
  // here is the difference between "this run is cheap" and "nobody has told
  // the system what a bottle of ink costs".
  const unpriced = unpricedLines(calculation.lines);

  return (
    <div className="space-y-5">
      {unpriced.length > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-warn bg-warn-soft px-4 py-3 text-xs text-warn"
        >
          هذا الحساب يشمل {unpriced.length} بنداً بلا سعر وحدة، فالإجمالي أقل من التكلفة
          الحقيقية. أدخِل الأسعار في المعادلة ثم أعِد الحساب:{' '}
          <span className="font-medium">{unpriced.map((l) => l.nameAr).join(' · ')}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4 text-xs text-txt-3">
        <span className={calculation.kind === 'ACTUAL' ? 'text-ok' : 'text-txt-3'}>
          {calculation.kind === 'ACTUAL' ? 'تكلفة فعلية' : 'تكلفة تقديرية'}
        </span>
        <span className="tnum">{calculation.computedAt.toLocaleString('ar-EG')}</span>
        <span className="tnum">الكمية: {formatQty(calculation.quantity)}</span>
        {calculation.formulas.map((f) => (
          <span key={f.id} className="rounded-full bg-brand-soft px-2.5 py-1 text-[0.7rem] text-brand">
            {f.formulaNameAr} — إصدار {f.version}
          </span>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="إجمالي التكلفة" value={formatMoney(calculation.totalCost)} strong />
        <Figure label="تكلفة القطعة" value={formatMoney(calculation.costPerPiece)} strong />
        <Figure label="تكلفة مباشرة" value={formatMoney(calculation.directCost)} />
        <Figure label="غير مباشرة وهالك" value={formatMoney(calculation.indirectCost)} />
      </div>

      {buckets.length > 0 && (
        <dl className="erp-card divide-y divide-line">
          {buckets.map((b) => (
            <div key={b.category} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <dt className="text-sm text-txt-2">{COST_CATEGORY_AR[b.category]}</dt>
              <dd className="tnum text-sm text-txt">
                {formatMoney(calculation[b.field] as never)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {dec(calculation.totalMinutes).gt(0) && (
        <p className="text-[0.7rem] text-txt-4">
          زمن التشغيل المحسوب: {formatQty(calculation.totalMinutes)} دقيقة للأمر كاملاً
          (يشمل زمن التجهيز مرة واحدة، لا لكل قطعة).
        </p>
      )}

      {showMargin && calculation.suggestedPrice && (
        <div className="erp-card p-5">
          <h4 className="mb-3 text-xs font-semibold text-brand">السعر المقترح</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Figure
              label={`سعر البيع لهامش ${formatQty(calculation.targetMarginPercent ?? 0)}٪`}
              value={formatMoney(calculation.suggestedPrice)}
              strong
            />
            <Figure
              label="ربح القطعة عند هذا السعر"
              value={formatMoney(dec(calculation.suggestedPrice).minus(dec(calculation.costPerPiece)))}
            />
          </div>
          <p className="mt-3 text-[0.7rem] text-txt-4">
            الهامش محسوب على سعر البيع لا على التكلفة — أي أن هامش ٢٥٪ يعني أن التكلفة
            ٧٥٪ من السعر. الخلط بين الاثنين هو أكثر سبب شائع لتسعير خاسر.
          </p>
        </div>
      )}

      <div>
        <h4 className="mb-3 text-xs font-semibold text-brand">بنود الحساب</h4>
        <Table
          headers={['#', 'البند', 'الوصف', 'الأساس', 'الكمية المستهلكة', 'تكلفة الوحدة', 'التكلفة', 'المصدر']}
          empty={calculation.lines.length === 0}
        >
          {calculation.lines.map((line) => (
            <tr key={line.id}>
              <td className="tnum px-4 py-3 text-txt-4">{line.sequence}</td>
              <td className="px-4 py-3 text-txt-3">
                {(COST_CATEGORY_AR as Record<string, string>)[line.category] ?? line.category}
              </td>
              <td className="px-4 py-3 text-txt">{line.nameAr}</td>
              <td className="px-4 py-3 text-[0.7rem] text-txt-3">
                {(COST_BASIS_AR as Record<string, string>)[line.basis] ?? line.basis}
              </td>
              <td className="tnum px-4 py-3 text-txt-2">
                {line.basis === 'PERCENT_OF_DIRECT'
                  ? `${formatQty(line.quantityPerBasis)}٪`
                  : `${formatQty(line.consumedQty)} ${line.unit ?? ''}`}
              </td>
              <td className="tnum px-4 py-3 text-txt-3">
                {line.basis === 'PERCENT_OF_DIRECT' ? '—' : formatMoney(line.unitCost)}
              </td>
              <td className="tnum px-4 py-3 font-medium text-txt">{formatMoney(line.lineCost)}</td>
              <td className="px-4 py-3 text-[0.7rem] text-txt-4">إصدار {line.version}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

/** Empty categories are hidden above, so this only ever shows real figures. */
function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="erp-card p-4">
      <p className="text-[0.7rem] text-txt-3">{label}</p>
      <p className={`tnum mt-1 ${strong ? 'text-lg font-semibold text-brand' : 'text-base text-txt'}`}>
        {value}
      </p>
    </div>
  );
}

export { COST_CATEGORIES };
