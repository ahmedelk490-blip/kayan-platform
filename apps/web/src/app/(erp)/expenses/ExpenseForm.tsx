'use client';

import { useActionState } from 'react';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_AR } from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '@/lib/ops';

export function ExpenseForm({
  action,
  employees,
  today,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  employees: { value: string; label: string }[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field
          name="expenseDate"
          label="التاريخ"
          type="date"
          dir="ltr"
          defaultValue={today}
          errors={state.fieldErrors}
        />
        <Select
          name="category"
          label="البند"
          required
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_AR[c] }))}
          defaultValue="FOOD"
          errors={state.fieldErrors}
        />
        <Field
          name="amount"
          label="المبلغ (د.ع)"
          type="number"
          required
          dir="ltr"
          errors={state.fieldErrors}
        />
        <Select
          name="employeeId"
          label="الموظف (اختياري)"
          options={employees}
          placeholder="بدون"
          errors={state.fieldErrors}
        />
      </div>

      <TextArea name="notes" label="اسم البند / الوصف (اكتب الصنف الذي اشتريته)" rows={2} />

      <div className="flex items-center gap-3">
        <SubmitButton label="تسجيل المصروف" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>

      <p className="text-[0.7rem] text-txt-4">
        يُسجَّل المصروف بانتظار الاعتماد دائماً — حتى لو سجّله المدير. لا يدخل في صافي
        الربح قبل اعتماده، ولا يعتمده من سجّله.
      </p>
    </form>
  );
}
