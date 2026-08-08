'use client';

import { useActionState } from 'react';
import { Field, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import { createWarehouse, createLocation, type FormState } from './actions';

function Ok({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
      {message}
    </p>
  );
}

export function WarehouseForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createWarehouse, {});
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormError message={state.error} />
      <Ok message={state.ok} />
      <Field name="code" label="الرمز" required dir="ltr" errors={state.fieldErrors} />
      <Field name="nameAr" label="الاسم" required errors={state.fieldErrors} />
      <TextArea name="address" label="العنوان" rows={2} errors={state.fieldErrors} />
      <SubmitButton label="إنشاء" />
    </form>
  );
}

export function LocationForm({ warehouseId }: { warehouseId: string }) {
  const bound = createLocation.bind(null, warehouseId);
  const [state, formAction] = useActionState<FormState, FormData>(bound, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" noValidate>
      <div className="w-32">
        <Field name="code" label="رمز الموقع" required dir="ltr" errors={state.fieldErrors} />
      </div>
      <div className="flex-1 min-w-40">
        <Field name="nameAr" label="الاسم" errors={state.fieldErrors} />
      </div>
      <SubmitButton label="إضافة موقع" />
      <FormError message={state.error} />
    </form>
  );
}
