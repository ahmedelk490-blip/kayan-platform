'use client';

import { useActionState } from 'react';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import { useFormSuccess } from '@/components/crud/useFormSuccess';
import { postMovement, type FormState } from './actions';
import { MOVEMENT_OPTIONS } from './types';

export function MovementForm({
  variants,
  warehouses,
  locations,
  onSuccess,
}: {
  variants: { value: string; label: string }[];
  warehouses: { value: string; label: string }[];
  locations: { value: string; label: string }[];
  /** Supplied by the modal only. The full page leaves it undefined. */
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(postMovement, {});
  useFormSuccess(state.ok, onSuccess);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.error} />
      {state.ok && !onSuccess && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-3 text-xs text-ok">
          {state.ok}
        </p>
      )}

      <Select
        name="variantId"
        label="المتغيّر"
        required
        options={variants}
        placeholder="اختر المتغيّر"
        errors={state.fieldErrors}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          name="type"
          label="نوع الحركة"
          required
          options={MOVEMENT_OPTIONS}
          defaultValue="RECEIPT"
          errors={state.fieldErrors}
        />
        <Field
          name="quantity"
          label="الكمية"
          type="number"
          required
          dir="ltr"
          errors={state.fieldErrors}
          hint="أدخل رقماً موجباً — النظام يحدد الاتجاه"
        />
        <Select
          name="warehouseId"
          label="المخزن"
          required
          options={warehouses}
          placeholder="اختر المخزن"
          errors={state.fieldErrors}
        />
        <Select name="locationId" label="الموقع / الرف" options={locations} placeholder="بدون موقع" />
        <Field name="reference" label="المرجع" errors={state.fieldErrors} />
      </div>

      <TextArea name="reason" label="السبب" rows={2} errors={state.fieldErrors} />
      <SubmitButton label="تسجيل الحركة" />
    </form>
  );
}
