'use client';

import { useActionState } from 'react';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '@/lib/ops';

/**
 * تسجيل جزاء.
 *
 * The damage cost is shown next to the amount field because the server caps
 * the penalty at it — telling the user the ceiling beforehand is kinder than
 * rejecting them afterwards.
 */
export function PenaltyForm({
  action,
  employees,
  damageCost,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  employees: { value: string; label: string }[];
  damageCost: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          name="employeeId"
          label="الموظف"
          required
          options={employees}
          placeholder="اختر موظفاً…"
          errors={state.fieldErrors}
        />
        <Field
          name="amount"
          label="المبلغ (د.ع)"
          type="number"
          required
          dir="ltr"
          hint={`الحد الأقصى ${damageCost} — تكلفة الهالك`}
          errors={state.fieldErrors}
        />
      </div>

      <TextArea name="reason" label="سبب الجزاء (مطلوب)" rows={2} errors={state.fieldErrors} />

      <div className="flex items-center gap-3">
        <SubmitButton label="تسجيل الجزاء" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
