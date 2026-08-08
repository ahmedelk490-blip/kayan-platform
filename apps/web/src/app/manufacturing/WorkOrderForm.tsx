'use client';

import { useActionState } from 'react';
import { Field, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/**
 * إضافة خطوة تشغيل.
 *
 * A work order here is a named step in sequence — قص، طباعة، تطريز، خياطة،
 * تشطيب. It carries no materials and no cost: those arrive with the Formula
 * and Cost engines. Keeping it deliberately thin is the point.
 */
export function WorkOrderForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <Field
        name="name"
        label="اسم الخطوة"
        required
        placeholder="قص · طباعة · تطريز · خياطة · تشطيب"
        errors={state.fieldErrors}
      />
      <div className="flex items-center gap-3">
        <SubmitButton label="إضافة خطوة" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
