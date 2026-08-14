'use client';

import { useActionState } from 'react';
import { PRICE_SERVICES, PRICE_SERVICE_AR } from '@erp/domain';
import { Field, Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '../actions';

/**
 * إضافة شريحة سعر.
 *
 * الشريحة = خدمة + نطاق كمية + سعر. سعر واحد لكل منتج لم يكن يكفي: القطعة
 * لها سعر مع التطريز وآخر مع DTF، ولكلٍّ سعر جملة وسعر للكميات الصغيرة.
 *
 * الحد الأعلى اختياري: فارغ يعني "وما فوق"، وهو شكل سعر الجملة المعتاد.
 */
export function PriceTierForm({
  action,
  variants,
  currency,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  variants: { value: string; label: string }[];
  currency: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          name="service"
          label="الخدمة"
          required
          errors={state.fieldErrors}
          options={PRICE_SERVICES.map((s) => ({ value: s, label: PRICE_SERVICE_AR[s] }))}
        />
        <Field
          name="minQty"
          label="من كمية"
          type="number"
          dir="ltr"
          required
          defaultValue="1"
          errors={state.fieldErrors}
        />
        <Field
          name="maxQty"
          label="إلى كمية"
          type="number"
          dir="ltr"
          errors={state.fieldErrors}
          hint="اتركه فارغاً ليعني «وما فوق»."
        />
        <Field
          name="price"
          label={`السعر (${currency})`}
          type="number"
          dir="ltr"
          required
          errors={state.fieldErrors}
        />
      </div>

      {variants.length > 0 && (
        <Select
          name="variantId"
          label="خاص بمتغيّر (اختياري)"
          placeholder="كل المتغيّرات"
          errors={state.fieldErrors}
          options={variants}
        />
      )}

      <div className="flex items-center gap-3">
        <SubmitButton label="إضافة الشريحة" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
