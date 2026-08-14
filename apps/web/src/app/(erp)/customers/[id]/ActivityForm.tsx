'use client';

import { useActionState } from 'react';
import { Field, TextArea, Select, SubmitButton, FormError } from '@/components/crud/Form';
import { addActivity, type FormState } from '../actions';

const TYPES = [
  { value: 'NOTE', label: 'ملاحظة' },
  { value: 'CALL', label: 'مكالمة' },
  { value: 'VISIT', label: 'زيارة' },
  { value: 'MEETING', label: 'اجتماع' },
  { value: 'WHATSAPP', label: 'واتساب' },
  { value: 'EMAIL', label: 'بريد' },
];

export function ActivityForm({ customerId }: { customerId: string }) {
  const bound = addActivity.bind(null, customerId);
  const [state, formAction] = useActionState<FormState, FormData>(bound, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Select name="type" label="النوع" options={TYPES} defaultValue="NOTE" errors={state.fieldErrors} />
      <Field name="title" label="العنوان" required errors={state.fieldErrors} />
      <TextArea name="body" label="التفاصيل" errors={state.fieldErrors} rows={2} />
      <SubmitButton label="إضافة" />
    </form>
  );
}
