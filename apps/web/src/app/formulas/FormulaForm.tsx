'use client';

import { useActionState } from 'react';
import { FORMULA_KINDS, FORMULA_KIND_AR } from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

export function FormulaForm({
  action,
  defaults,
  submitLabel = 'حفظ',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: { nameAr?: string; kind?: string; notes?: string | null };
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          name="nameAr"
          label="اسم المعادلة"
          required
          defaultValue={defaults?.nameAr ?? ''}
          placeholder="طباعة تيشيرت — شاشة"
          errors={state.fieldErrors}
        />
        <Select
          name="kind"
          label="النوع"
          required
          options={FORMULA_KINDS.map((k) => ({ value: k, label: FORMULA_KIND_AR[k] }))}
          defaultValue={defaults?.kind ?? 'PRINTING'}
          errors={state.fieldErrors}
        />
      </div>

      <TextArea name="notes" label="ملاحظات" defaultValue={defaults?.notes ?? ''} />

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
