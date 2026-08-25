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
 * محضر هالك — مبسّط لأربع خانات فقط بطلب المالك: نوع المنتج، اللون، نوع
 * الخدمة، والعدد. التكلفة تُحسب تلقائياً من تكلفة قطعة المنتج × العدد،
 * والسبب يُبنى من اللون والخدمة — فلا حقول زائدة يملؤها المستخدم.
 */
export function DamageForm({
  action,
  products,
  services,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  products: DamageProduct[];
  services: Option[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [productId, setProductId] = useState('');

  const colors = products.find((p) => p.id === productId)?.colors ?? [];

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

        {/* ٢) اللون — من ألوان المنتج المختار */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">اللون</span>
          <select name="colorId" disabled={colors.length === 0} className="erp-input py-2.5 disabled:opacity-50">
            <option value="">{colors.length ? 'اختر اللون…' : '—'}</option>
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
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="تسجيل الهالك" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
      <p className="text-[0.7rem] leading-[1.8] text-txt-4">
        التكلفة تُحسب تلقائياً من تكلفة قطعة المنتج × العدد. يُسجَّل الهالك بانتظار الاعتماد،
        ويظهر في «الهالك» بالبيان المالي بعد اعتماده.
      </p>
    </form>
  );
}
