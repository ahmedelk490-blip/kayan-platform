'use client';

import { useActionState } from 'react';
import { Field, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import { useFormSuccess } from '@/components/crud/useFormSuccess';
import type { FormState } from './actions';

export interface CustomerValues {
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
}

export function CustomerForm({
  action,
  values,
  submitLabel,
  onSuccess,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: CustomerValues;
  submitLabel?: string;
  /** Supplied by the modal only. The full page leaves it undefined. */
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  useFormSuccess(state.ok, onSuccess);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="contactName"
          label="اسم المسؤول"
          required
          errors={state.fieldErrors}
          defaultValue={values?.contactName}
        />
        <Field
          name="companyName"
          label="اسم الشركة"
          errors={state.fieldErrors}
          defaultValue={values?.companyName}
        />
        <Field
          name="phone"
          label="رقم الهاتف"
          required
          type="tel"
          dir="ltr"
          errors={state.fieldErrors}
          defaultValue={values?.phone}
        />
        <Field
          name="whatsapp"
          label="واتساب"
          type="tel"
          dir="ltr"
          errors={state.fieldErrors}
          defaultValue={values?.whatsapp}
        />
        <Field
          name="email"
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          errors={state.fieldErrors}
          defaultValue={values?.email}
        />
        <Field
          name="taxNumber"
          label="الرقم الضريبي"
          dir="ltr"
          errors={state.fieldErrors}
          defaultValue={values?.taxNumber}
        />
      </div>

      <TextArea name="address" label="العنوان" errors={state.fieldErrors} defaultValue={values?.address} rows={2} />
      <TextArea name="notes" label="ملاحظات" errors={state.fieldErrors} defaultValue={values?.notes} />

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        {/* The modal closes on success, so this is only ever seen on the
            full-page route. */}
        {state.ok && !onSuccess && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
