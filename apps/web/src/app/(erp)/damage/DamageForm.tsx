'use client';

import { useActionState, useState } from 'react';
import { Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '@/lib/ops';

export interface Option {
  value: string;
  label: string;
}

export interface DamageProduct {
  id: string;
  nameAr: string;
  colors: Option[];
}

/**
 * محضر هالك — نوع المنتج، اللون، نوع الخدمة، والعدد. الألوان كلها متاحة دائماً
 * (لا تعتمد على متغيّرات المنتج) فلا تبقى القائمة مقفولة. التكلفة تُحسب تلقائياً
 * من تكلفة قطعة المنتج × العدد، أو تُكتب يدوياً إن تركها التلقائي غير مناسب.
 */
export function DamageForm({
  action,
  products,
  colors,
  services,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  products: DamageProduct[];
  colors: Option[];
  services: Option[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [productId, setProductId] = useState('');

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormError message={state.error} />
      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">{state.ok}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* ١) نوع المنتج */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">نوع المنتج</span>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="erp-input py-2.5"
          >
            <option value="">اختر المنتج…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.nameAr}</option>
            ))}
          </select>
          <input type="hidden" name="productId" value={productId} />
          {state.fieldErrors?.productId && (
            <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.productId}</span>
          )}
        </label>

        {/* ٢) اللون — كل الألوان متاحة دائماً */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">اللون</span>
          <select name="colorId" className="erp-input py-2.5">
            <option value="">{colors.length ? 'اختر اللون…' : 'لا ألوان معرّفة'}</option>
            {colors.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>

        {/* ٣) نوع الخدمة */}
        <Select name="service" label="نوع الخدمة" options={services} placeholder="اختر الخدمة" errors={state.fieldErrors} />

        {/* ٤) العدد */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">العدد</span>
          <input name="quantity" type="number" min="1" step="1" dir="ltr" className="erp-input py-2.5 text-start" />
          {state.fieldErrors?.quantity && (
            <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.quantity}</span>
          )}
        </label>

        {/* ٥) التكلفة اليدوية (اختياري) — تتجاوز الحساب التلقائي إن مُلئت */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">التكلفة (يدوي — اختياري)</span>
          <input name="manualCost" type="number" min="0" step="0.01" dir="ltr" placeholder="تلقائي" className="erp-input py-2.5 text-start" />
          {state.fieldErrors?.manualCost && (
            <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.manualCost}</span>
          )}
        </label>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="تسجيل الهالك" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
      <p className="text-[0.7rem] leading-[1.8] text-txt-4">
        التكلفة تُحسب تلقائياً من تكلفة قطعة المنتج × العدد — أو اكتبها يدوياً في خانة «التكلفة»
        لتتجاوز الحساب التلقائي. يُسجَّل الهالك بانتظار الاعتماد، ويظهر في «الهالك» بالبيان المالي بعد اعتماده.
      </p>
    </form>
  );
}
