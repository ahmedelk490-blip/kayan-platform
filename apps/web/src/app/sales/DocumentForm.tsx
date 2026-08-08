'use client';

import { useActionState, useState } from 'react';
import { calcLine, calcDocument, money } from '@erp/domain';
import { Field, TextArea, Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

export interface VariantOption {
  value: string;
  label: string;
  price: number;
  available: number;
}

export interface DocLine {
  variantId: string;
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
  quantity: 1,
  unitPrice: 0,
  discountAmount: 0,
  taxRate: 0,
  notes: '',
});

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

  const priceOf = (id: string) => variants.find((v) => v.value === id)?.price ?? 0;

  function update(index: number, patch: Partial<DocLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
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
            return (
              <div key={index} className="rounded-lg border border-line bg-card-2 p-4">
                <div className="grid gap-3 lg:grid-cols-[2fr_repeat(4,1fr)_auto]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-txt-2">المتغيّر</span>
                    <select
                      name="lineVariantId"
                      value={line.variantId}
                      onChange={(e) => {
                        const id = e.target.value;
                        update(index, { variantId: id, unitPrice: priceOf(id) || line.unitPrice });
                      }}
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

                  <NumberCell label="الكمية" name="lineQuantity" value={line.quantity} onChange={(v) => update(index, { quantity: v })} />
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
                    الإجمالي: <span className="tnum text-txt">{t.lineTotal}</span>
                  </span>
                  {variant && (
                    <span className={short ? 'text-bad' : 'text-txt-3'}>
                      المتاح: <span className="tnum">{variant.available}</span>
                      {short && ' — الكمية المطلوبة أكبر من المتاح'}
                    </span>
                  )}
                </div>
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
          <Row label="الخصم" value={-totals.discountAmount} />
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

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? 'font-medium text-txt' : 'text-txt-3'}>{label}</dt>
      <dd className={`tnum ${strong ? 'text-base font-semibold text-brand' : 'text-txt-2'}`}>
        {money(value)}
      </dd>
    </div>
  );
}
