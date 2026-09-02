'use client';

import { useActionState, useState } from 'react';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import { SearchableSelect } from '@/components/crud/SearchableSelect';
import { useFormSuccess } from '@/components/crud/useFormSuccess';
import { postMovement, type FormState } from './actions';
import { MOVEMENT_OPTIONS } from './types';

export interface VariantChoice {
  value: string;
  label: string;
  /** قطع الدستة لمنتج هذا المتغيّر — لحساب الكمية من الدست. */
  perDozen: number;
}

export function MovementForm({
  variants,
  onSuccess,
}: {
  variants: VariantChoice[];
  /** Supplied by the modal only. The full page leaves it undefined. */
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(postMovement, {});
  useFormSuccess(state.ok, onSuccess);

  const [variantId, setVariantId] = useState('');
  const [dozens, setDozens] = useState(0);
  const [pieces, setPieces] = useState(0);

  const perDozen = variants.find((v) => v.value === variantId)?.perDozen ?? 12;
  const totalQty = dozens * perDozen + pieces;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.error} />
      {state.ok && !onSuccess && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-3 text-xs text-ok">
          {state.ok}
        </p>
      )}

      {/* المتغيّر — بحثٌ بالكتابة: اكتب «يلك أسود L» بدل التمرير بين مئات
          المقاسات والألوان. الاختيار يُعلمنا قطع الدستة لحساب الكمية. */}
      <label className="block">
        <span className="mb-1.5 block text-xs text-txt-2">المتغيّر</span>
        <SearchableSelect
          name="variantId"
          options={variants.map((v) => ({ value: v.value, label: v.label }))}
          placeholder="اكتب اسم الصنف أو اللون أو المقاس…"
          onSelect={setVariantId}
        />
        {state.fieldErrors?.variantId && (
          <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.variantId}</span>
        )}
      </label>

      {/* الكمية بالدست + قطعة زيادة — تُحسب إلى إجمالي قطع. */}
      <div className="rounded-xl border border-brand/25 bg-brand-soft/40 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-txt-2">دست</span>
            <input type="number" min="0" step="1" dir="ltr" value={dozens}
              onChange={(e) => setDozens(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="erp-input py-2.5 text-start" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-txt-2">قطعة زيادة</span>
            <input type="number" min="0" step="1" dir="ltr" value={pieces}
              onChange={(e) => setPieces(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="erp-input py-2.5 text-start" />
          </label>
          <div className="block">
            <span className="mb-1.5 block text-xs text-txt-2">الإجمالي (قطعة)</span>
            <div className="tnum rounded-lg border border-line bg-card px-3 py-2.5 text-sm font-bold text-brand">{totalQty}</div>
          </div>
        </div>
        <p className="mt-2 text-[0.7rem] text-txt-4">
          {variantId ? `الدستة = ${perDozen} قطعة لهذا المنتج.` : 'اختر المتغيّر لمعرفة قطع الدستة.'} للإدخال بالقطعة فقط اترك «دست» صفراً.
        </p>
        {/* الكمية المُرسَلة للخادم — الإجمالي المحسوب. */}
        <input type="hidden" name="quantity" value={totalQty} />
        {state.fieldErrors?.quantity && (
          <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.quantity}</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          name="type"
          label="نوع الحركة"
          required
          options={MOVEMENT_OPTIONS}
          defaultValue="RECEIPT"
          errors={state.fieldErrors}
        />
        <Field name="reference" label="المرجع (اختياري)" errors={state.fieldErrors} />
      </div>

      <TextArea name="reason" label="السبب" rows={2} errors={state.fieldErrors} />
      <SubmitButton label="تسجيل الحركة" />
    </form>
  );
}
