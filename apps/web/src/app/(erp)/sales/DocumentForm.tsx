'use client';

import { useActionState, useState } from 'react';
import {
  calcLine,
  calcDocument,
  formatMoney,
  applicableTier,
  PRICE_SERVICE_AR,
  type PriceService,
  type Numeric,
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

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormError message={state.error} />
      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          {state.ok}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          name="customerId"
          label="العميل"
          required
          options={customers}
          placeholder="اختر العميل"
          defaultValue={values?.customerId}
          errors={state.fieldErrors}
        />
        <Field name={labels.dateA === 'تاريخ الإصدار' ? 'issueDate' : 'orderDate'} label={labels.dateA} type="date" dir="ltr" defaultValue={values?.dateA} />
        <Field name={labels.dateB === 'تاريخ الانتهاء' ? 'expiryDate' : 'requiredDeliveryDate'} label={labels.dateB} type="date" dir="ltr" defaultValue={values?.dateB} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand">البنود</h3>
          <button type="button" onClick={() => setLines((p) => [...p, emptyLine()])} className="erp-btn-ghost">
            إضافة بند
          </button>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => {
            const t = calcLine(line);
            const variant = variants.find((v) => v.value === line.variantId);
            const short = variant && line.quantity > variant.available;
            // هل تغطّي شريحةٌ هذه الكمية والخدمة؟ إن اختِيرت خدمة ولم تطابق
            // شريحة فالسعر لم يُحدَّث تلقائياً — ننبّه بدل أن نخفي الخطأ.
            const priceGap =
              variant &&
              line.service &&
              !applicableTier(variant.tiers, {
                service: line.service,
                quantity: line.quantity,
                variantId: line.variantId,
              });
            return (
              <div key={index} className="rounded-lg border border-line bg-card-2 p-4">
                <div className="grid gap-3 lg:grid-cols-[1.7fr_1.1fr_repeat(4,1fr)_auto]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-txt-2">المتغيّر</span>
                    <select
                      name="lineVariantId"
                      value={line.variantId}
                      onChange={(e) => updatePriced(index, { variantId: e.target.value })}
                      className="erp-input py-2.5"
                    >
                      <option value="">اختر…</option>
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
                      disabled={!variant || servicesOf(variant).length === 0}
                      className="erp-input py-2.5 disabled:opacity-50"
                    >
                      {(!variant || servicesOf(variant).length === 0) && <option value="">—</option>}
                      {variant &&
                        servicesOf(variant).map((s) => (
                          <option key={s} value={s}>
                            {PRICE_SERVICE_AR[s as PriceService] ?? s}
                          </option>
                        ))}
                    </select>
                  </label>

                  <NumberCell label="الكمية" name="lineQuantity" value={line.quantity} onChange={(v) => updatePriced(index, { quantity: v })} />
                  <NumberCell label="سعر الوحدة" name="lineUnitPrice" value={line.unitPrice} onChange={(v) => update(index, { unitPrice: v })} />
                  <NumberCell label="خصم" name="lineDiscount" value={line.discountAmount} onChange={(v) => update(index, { discountAmount: v })} />
                  <NumberCell label="ضريبة %" name="lineTaxRate" value={line.taxRate} onChange={(v) => update(index, { taxRate: v })} />

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, i) => i !== index) : p))}
                      className="rounded-lg border border-bad px-3 py-2.5 text-xs text-bad"
                      aria-label="حذف البند"
                    >
                      حذف
                    </button>
                  </div>
                </div>

                <input type="hidden" name="lineNotes" value={line.notes} />

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="text-txt-3">
                    الإجمالي: <span className="tnum text-txt">{formatMoney(t.lineTotal)}</span>
                  </span>
                  {variant && (
                    <span className={short ? 'text-bad' : 'text-txt-3'}>
                      المتاح: <span className="tnum">{variant.available}</span>
                      {short && ' — الكمية المطلوبة أكبر من المتاح'}
                    </span>
                  )}
                </div>

                {priceGap && (
                  <p className="mt-1.5 text-[0.7rem] text-warn">
                    لا توجد شريحة سعر لهذه الكمية ضمن خدمة{' '}
                    {PRICE_SERVICE_AR[line.service as PriceService] ?? line.service} — راجع سعر الوحدة يدوياً.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">خصم على المستند</span>
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
          <TextArea name="notes" label="ملاحظات" defaultValue={values?.notes} rows={3} />
        </div>

        <dl className="erp-card h-fit space-y-2.5 p-5 text-sm">
          <Row label="المجموع قبل الخصم" value={totals.subtotal} />
          <Row label="الخصم" value={totals.discountAmount.negated()} />
          <Row label="الضريبة" value={totals.taxAmount} />
          <div className="border-t border-line pt-2.5">
            <Row label="الإجمالي" value={totals.total} strong />
          </div>
          <p className="pt-1 text-[0.7rem] text-txt-4">
            الأسعار تُحفظ كما هي وقت الإنشاء ولا يُعاد حسابها لاحقاً.
          </p>
        </dl>
      </div>

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

function Row({ label, value, strong }: { label: string; value: Numeric; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? 'font-medium text-txt' : 'text-txt-3'}>{label}</dt>
      <dd className={`tnum ${strong ? 'text-base font-semibold text-brand' : 'text-txt-2'}`}>
        {formatMoney(value)}
      </dd>
    </div>
  );
}
