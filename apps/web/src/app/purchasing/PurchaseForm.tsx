'use client';

import { useActionState, useState } from 'react';
import {
  calcPurchaseLine,
  calcPurchaseDocument,
  formatMoney,
  PURCHASE_TARGET_AR,
  PURCHASE_TARGETS,
} from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

export interface Option {
  value: string;
  label: string;
  price?: number;
}

interface Line {
  key: number;
  target: string;
  ref: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  description: string;
}

const blank = (key: number): Line => ({
  key,
  target: 'SUPPLY',
  ref: '',
  quantity: '',
  unitPrice: '',
  discount: '0',
  taxRate: '0',
  description: '',
});

/**
 * أمر شراء جديد.
 *
 * البنود صفوف متوازية في نفس النموذج — بلا حالة عميل معقّدة، ويشتغل حتى لو
 * تعطّلت الـ JavaScript جزئياً.
 *
 * The running total is computed with the same domain function the server
 * uses, so what the buyer sees before saving is what gets stored.
 */
export function PurchaseForm({
  action,
  suppliers,
  variants,
  supplies,
  today,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  suppliers: Option[];
  variants: Option[];
  supplies: Option[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [lines, setLines] = useState<Line[]>([blank(1)]);
  const [nextKey, setNextKey] = useState(2);

  function update(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const totals = lines
    .filter((l) => l.ref && Number(l.quantity) > 0)
    .map((l) =>
      calcPurchaseLine({
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        discountAmount: Number(l.discount) || 0,
        taxRate: Number(l.taxRate) || 0,
      }),
    );
  const doc = calcPurchaseDocument(totals);

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-txt-3">
        لا يوجد موردون. أضِف مورّداً أولاً من صفحة الموردين قبل إنشاء أمر شراء.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />

      <div className="grid gap-5 md:grid-cols-3">
        <Select
          name="supplierId"
          label="المورّد"
          required
          options={suppliers}
          placeholder="اختر مورّداً…"
          errors={state.fieldErrors}
        />
        <Field
          name="expectedDate"
          label="تاريخ التوريد المتوقع"
          type="date"
          dir="ltr"
          defaultValue={today}
          errors={state.fieldErrors}
        />
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-brand">البنود</h4>

        {lines.map((line) => {
          const options = line.target === 'VARIANT' ? variants : supplies;
          return (
            <div
              key={line.key}
              className="grid gap-3 rounded-lg border border-line p-4 md:grid-cols-[1fr_2fr_repeat(4,0.8fr)_auto]"
            >
              <select
                name="lineTarget"
                value={line.target}
                onChange={(e) => update(line.key, { target: e.target.value, ref: '' })}
                aria-label="نوع البند"
                className="erp-input py-2 text-xs"
              >
                {PURCHASE_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {PURCHASE_TARGET_AR[t]}
                  </option>
                ))}
              </select>

              <select
                name="lineRef"
                value={line.ref}
                onChange={(e) => {
                  const picked = options.find((o) => o.value === e.target.value);
                  update(line.key, {
                    ref: e.target.value,
                    // Last known cost as a starting point, still editable —
                    // the supplier's price today is what actually counts.
                    unitPrice: picked?.price ? String(picked.price) : line.unitPrice,
                  });
                }}
                aria-label="الصنف"
                className="erp-input py-2 text-xs"
              >
                <option value="">اختر…</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <input
                name="lineQuantity"
                type="number"
                step="any"
                dir="ltr"
                placeholder="الكمية"
                value={line.quantity}
                onChange={(e) => update(line.key, { quantity: e.target.value })}
                aria-label="الكمية"
                className="erp-input py-2 text-xs"
              />
              <input
                name="lineUnitPrice"
                type="number"
                step="any"
                dir="ltr"
                placeholder="سعر الوحدة"
                value={line.unitPrice}
                onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                aria-label="سعر الوحدة"
                className="erp-input py-2 text-xs"
              />
              <input
                name="lineDiscount"
                type="number"
                step="any"
                dir="ltr"
                placeholder="خصم"
                value={line.discount}
                onChange={(e) => update(line.key, { discount: e.target.value })}
                aria-label="خصم"
                className="erp-input py-2 text-xs"
              />
              <input
                name="lineTaxRate"
                type="number"
                step="any"
                dir="ltr"
                placeholder="ضريبة ٪"
                value={line.taxRate}
                onChange={(e) => update(line.key, { taxRate: e.target.value })}
                aria-label="نسبة الضريبة"
                className="erp-input py-2 text-xs"
              />
              <input type="hidden" name="lineDescription" value={line.description} />

              <button
                type="button"
                onClick={() => setLines((c) => (c.length > 1 ? c.filter((l) => l.key !== line.key) : c))}
                className="text-xs text-bad hover:underline disabled:opacity-40"
                disabled={lines.length === 1}
              >
                حذف
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setLines((c) => [...c, blank(nextKey)]);
            setNextKey((k) => k + 1);
          }}
          className="erp-btn-ghost"
        >
          + بند
        </button>
      </div>

      <dl className="erp-card ms-auto max-w-xs space-y-2 p-5 text-sm">
        <Row label="المجموع" value={formatMoney(doc.subtotal)} />
        <Row label="الضريبة" value={formatMoney(doc.taxAmount)} />
        <div className="border-t border-line pt-2">
          <Row label="الإجمالي" value={formatMoney(doc.total)} strong />
        </div>
      </dl>

      <TextArea name="notes" label="ملاحظات" rows={2} />

      <div className="flex items-center gap-3">
        <SubmitButton label="إنشاء أمر الشراء" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>

      <p className="text-[0.7rem] text-txt-4">
        يُنشأ الأمر كمسودة. التأكيد ثم الاستلام خطوتان منفصلتان — ومن يستلم غير من
        يطلب، عن قصد.
      </p>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? 'font-medium text-txt' : 'text-txt-3'}>{label}</dt>
      <dd className={`tnum ${strong ? 'font-semibold text-brand' : 'text-txt-2'}`}>{value}</dd>
    </div>
  );
}
