'use client';

import { useActionState } from 'react';
import { Field, Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '@/lib/ops';

/** إضافة مصروف ثابت (قالب): اسم + تصنيف + مبلغ. يُسجَّل بضغطة كل شهر. */
export function RecurringForm({
  action,
  categories,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  categories: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_auto] sm:items-end">
      <FormError message={state.error} />
      <Field name="nameAr" label="اسم المصروف الثابت" placeholder="مثال: إيجار المحل" errors={state.fieldErrors} />
      <Select name="category" label="التصنيف" options={categories} errors={state.fieldErrors} />
      <Field name="amount" label="المبلغ (د.ع)" type="number" dir="ltr" errors={state.fieldErrors} />
      <SubmitButton label="إضافة" />
      {state.ok && <span className="text-xs text-ok sm:col-span-4">{state.ok}</span>}
    </form>
  );
}
