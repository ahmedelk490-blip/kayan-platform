'use client';

import { useActionState, useState } from 'react';
import {
  calcLine,
  calcDocument,
  formatMoney,
  applicableTier,
  PRICE_SERVICE_AR,
  type PriceService,
} from '@erp/domain';
import { Field, TextArea, Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/** شريحة سعر مبسّطة تعبر إلى العميل — أرقام لا Decimal. */
export interface VariantTier {
  service: string;
  minQty: number;
  maxQty: number | null;
  price: number;
  variantId: string | null;
  isActive: boolean;
}

export interface VariantOption {
  value: string;
  label: string;
  price: number;
  available: number;
  /** شرائح سعر منتج هذا المتغيّر — السعر الحقيقي حسب الخدمة والكمية. */
  tiers: VariantTier[];
}

export interface DocLine {
  variantId: string;
  /** الخدمة المختارة (تطريز/DTF…)، تحدّد الشريحة والسعر. */
  service: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  notes: string;
}

export interface DocValues {
  customerId?: string | null;
  notes?: string | null;
  discountAmount?: number;
  discountPercent?: number;
  dateA?: string;
  dateB?: string;
  lines?: DocLine[];
}

const emptyLine = (): DocLine => ({
  variantId: '',
  service: '',
  quantity: 1,
  unitPrice: 0,
  discountAmount: 0,
  taxRate: 0,
  notes: '',
});

/** خدمات هذا المتغيّر — المميّزة من شرائحه، بترتيب ظهورها. */
function servicesOf(v: VariantOption): string[] {
  const seen: string[] = [];
  for (const t of v.tiers) if (!seen.includes(t.service)) seen.push(t.service);
  return seen;
}

/**
 * Shared editor for quotations and sales orders — identical line structure,
 * so one component rather than two that drift apart.
 *
 * Totals shown here are a preview only. The server recalculates from the
 * submitted values and stores its own result, so a tampered client cannot
 * change what is recorded.
 */
export function DocumentForm({
  action,
  customers,
  variants,
  values,
  labels,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  customers: { value: string; label: string }[];
  variants: VariantOption[];
  values?: DocValues;
  labels: { dateA: string; dateB: string };
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [lines, setLines] = useState<DocLine[]>(
    values?.lines?.length ? values.lines : [emptyLine()],
  );
  const [docDiscount, setDocDiscount] = useState(values?.discountAmount ?? 0);
  const [docDiscountPct, setDocDiscountPct] = useState(values?.discountPercent ?? 0);

  /**
   * يعيد تسعير السطر من شريحة الخدمة والكمية — هذا هو الحساب الصحيح.
   *
   * سعر المتغيّر الثابت غالباً فارغ، والسعر الحقيقي في شرائح (خدمة، كمية).
   * فمتى تغيّر المتغيّر أو الخدمة أو الكمية أعدنا ملء سعر الوحدة من الشريحة
   * المطابقة. إن لم تطابق شريحة استعملنا السعر الثابت إن وُجد، وإلا تركنا ما
   * أدخله المستخدم يدوياً — لا نخترع صفراً.
   */
  function reprice(line: DocLine): DocLine {
    const v = variants.find((x) => x.value === line.variantId);
    if (!v) return line;
    if (line.service) {
      const tier = applicableTier(v.tiers, {
        service: line.service,
        quantity: line.quantity,
        variantId: line.variantId,
      });
      if (tier) return { ...line, unitPrice: tier.price };
    }
    if (v.tiers.length === 0 && v.price > 0) return { ...line, unitPrice: v.price };
    return line;
  }

  function update(index: number, patch: Partial<DocLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  /** تعديل يُعقبه إعادة تسعير — للمتغيّر والخدمة والكمية. */
  function updatePriced(index: number, patch: Partial<DocLine>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
        // عند تبديل المتغيّر: اختر خدمة معقولة (أول خدمة متاحة) إن لم تعد
        // الخدمة الحالية موجودة، حتى يبدأ التسعير فوراً.
        if (patch.variantId !== undefined) {
          const v = variants.find((x) => x.value === patch.variantId);
          const services = v ? servicesOf(v) : [];
          next.service = services.includes(next.service) ? next.service : services[0] ?? '';
        }
        return reprice(next);
      }),
    );
  }

  const computed = lines
    .filter((l) => l.variantId && l.quantity > 0)
    .map((l) => calcLine(l));
  const totals = calcDocument(computed, {
    discountAmount: docDiscount,
    discountPercent: docDiscountPct,
  });

  const hasDiscount = !totals.discountAmount.eq(0);
  const hasTax = !totals.taxAmount.eq(0);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormError message={state.error} />
      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          {state.ok}
        </p>
      )}

      {/* ١. العميل. خطوة واحدة واضحة أعلى الصفحة. */}
      <Select
        name="customerId"
        label="العميل"
        required
        options={customers}
        placeholder="اختر العميل"
        defaultValue={values?.customerId}
        errors={state.fieldErrors}
      />

      {/* ٢. البنود — لكل بند: المنتج، الخدمة، الكمية، والسعر يظهر محسوباً.
          لا خصم ولا ضريبة ولا سعر وحدة في كل صف: أُزيلت من الواجهة وتُرسل
          أصفاراً، فالصف صار ثلاث خانات فقط. السعر يُملأ تلقائياً، ولا يظهر
          حقل سعر إلا حين لا توجد شريحة تغطّي الكمية. */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-brand">الأصناف</h3>

        <div className="space-y-3">
          {lines.map((line, index) => {
            const t = calcLine(line);
            const variant = variants.find((v) => v.value === line.variantId);
            const short = variant && line.quantity > variant.available;
            const services = variant ? servicesOf(variant) : [];
            // هل تغطّي شريحةٌ هذه الكمية والخدمة؟
            const priceGap =
              variant &&
              line.service &&
              !applicableTier(variant.tiers, {
                service: line.service,
                quantity: line.quantity,
                variantId: line.variantId,
              });
            // نُظهر حقل سعر يدوي فقط حين لا يوجد سعر تلقائي صالح — وإلا نرسل
            // السعر التلقائي في حقل مخفي فلا يشغل المستخدم.
            const needsManualPrice = !!variant && (line.unitPrice <= 0 || !!priceGap);

            return (
              <div key={index} className="rounded-xl border border-line bg-card-2 p-4">
                <div className="grid items-end gap-3 sm:grid-cols-[1.8fr_1fr_0.8fr_auto]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-txt-2">المنتج</span>
                    <select
                      name="lineVariantId"
                      value={line.variantId}
                      onChange={(e) => updatePriced(index, { variantId: e.target.value })}
                      className="erp-input py-2.5"
                    >
                      <option value="">اختر المنتج…</option>
                      {variants.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs text-txt-2">الخدمة</span>
                    <select
                      value={line.service}
                      onChange={(e) => updatePriced(index, { service: e.target.value })}
                      disabled={services.length === 0}
                      className="erp-input py-2.5 disabled:opacity-50"
                    >
                      {services.length === 0 && <option value="">—</option>}
                      {services.map((s) => (
                        <option key={s} value={s}>
                          {PRICE_SERVICE_AR[s as PriceService] ?? s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <NumberCell
                    label="الكمية"
                    name="lineQuantity"
                    value={line.quantity}
                    onChange={(v) => updatePriced(index, { quantity: v })}
                  />

                  <button
                    type="button"
                    onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, i) => i !== index) : p))}
                    disabled={lines.length === 1}
                    className="grid h-[42px] w-10 place-items-center rounded-lg border border-line text-txt-3 transition-colors hover:border-bad hover:text-bad disabled:opacity-30"
                    aria-label="حذف الصنف"
                    title="حذف الصنف"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* الحقول المخفية تُبقي عقد الخادم كما هو: خصم وضريبة السطر
                    صفر, وملاحظة السطر فارغة. */}
                <input type="hidden" name="lineDiscount" value={0} />
                <input type="hidden" name="lineTaxRate" value={0} />
                <input type="hidden" name="lineNotes" value={line.notes} />
                {!needsManualPrice && <input type="hidden" name="lineUnitPrice" value={line.unitPrice} />}

                {/* السطر السفلي: السعر والإجمالي والمتاح — قراءة فقط. */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line/60 pt-3 text-sm">
                  <span className="text-txt-3">
                    {variant && line.unitPrice > 0 ? (
                      <>
                        <span className="tnum">{formatMoney(line.unitPrice)}</span> × {line.quantity}
                      </>
                    ) : (
                      'اختر المنتج والخدمة'
                    )}
                    {variant && short && (
                      <span className="ms-3 text-bad">المتاح {variant.available} فقط</span>
                    )}
                  </span>
                  <span className="font-semibold text-txt">
                    <span className="tnum">{formatMoney(t.lineTotal)}</span>
                  </span>
                </div>

                {needsManualPrice && (
                  <div className="mt-3 rounded-lg border border-warn bg-warn-soft p-3">
                    <p className="mb-2 text-[0.72rem] text-warn">
                      لا يوجد سعر جاهز لهذه الكمية{line.service ? '' : ' — اختر الخدمة أولاً'}. اكتب سعر الوحدة يدوياً:
                    </p>
                    <NumberCell
                      label="سعر الوحدة"
                      name="lineUnitPrice"
                      value={line.unitPrice}
                      onChange={(v) => update(index, { unitPrice: v })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setLines((p) => [...p, emptyLine()])}
          className="mt-3 w-full rounded-xl border border-dashed border-line py-3 text-sm font-medium text-txt-2 transition-colors hover:border-brand hover:text-brand"
        >
          + إضافة صنف آخر
        </button>
      </section>

      {/* ٣. الإجمالي — كبير وواضح. */}
      <div className="flex items-center justify-between rounded-xl border border-line bg-card-2 px-5 py-4">
        <span className="text-sm text-txt-2">الإجمالي</span>
        <span className="tnum text-2xl font-bold text-brand">{formatMoney(totals.total)}</span>
      </div>
      {(hasDiscount || hasTax) && (
        <p className="-mt-3 flex flex-wrap justify-end gap-x-4 text-xs text-txt-3">
          <span>المجموع <span className="tnum">{formatMoney(totals.subtotal)}</span></span>
          {hasDiscount && <span>الخصم <span className="tnum">-{formatMoney(totals.discountAmount)}</span></span>}
          {hasTax && <span>الضريبة <span className="tnum">{formatMoney(totals.taxAmount)}</span></span>}
        </p>
      )}

      {/* ٤. اختياري ومطويّ: خصم وتواريخ وملاحظات — لا يراها من لا يحتاجها. */}
      <details className="rounded-xl border border-line bg-card-2 px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-txt-2">
          خيارات إضافية — خصم، تواريخ، ملاحظات
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">خصم (مبلغ)</span>
              <input
                name="discountAmount"
                type="number"
                step="0.01"
                dir="ltr"
                value={docDiscount}
                onChange={(e) => setDocDiscount(Number(e.target.value) || 0)}
                className="erp-input py-2.5 text-start"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">خصم %</span>
              <input
                name="discountPercent"
                type="number"
                step="0.01"
                dir="ltr"
                value={docDiscountPct}
                onChange={(e) => setDocDiscountPct(Number(e.target.value) || 0)}
                className="erp-input py-2.5 text-start"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name={labels.dateA === 'تاريخ الإصدار' ? 'issueDate' : 'orderDate'} label={labels.dateA} type="date" dir="ltr" defaultValue={values?.dateA} />
            <Field name={labels.dateB === 'تاريخ الانتهاء' ? 'expiryDate' : 'requiredDeliveryDate'} label={labels.dateB} type="date" dir="ltr" defaultValue={values?.dateB} />
          </div>
          <TextArea name="notes" label="ملاحظات" defaultValue={values?.notes} rows={3} />
        </div>
      </details>

      <SubmitButton label={submitLabel} />
    </form>
  );
}

function NumberCell({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-txt-2">{label}</span>
      <input
        name={name}
        type="number"
        step="0.01"
        dir="ltr"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="erp-input py-2.5 text-start"
      />
    </label>
  );
}
