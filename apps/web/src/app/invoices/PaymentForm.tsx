'use client';

import { useActionState } from 'react';
import { PAYMENT_METHODS, PAYMENT_METHOD_AR } from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/**
 * تسجيل دفعة.
 *
 * The outstanding balance is offered as the default because "they paid the
 * rest" is the common case. The server re-checks it — the default is a
 * convenience, never the control.
 */
export function PaymentForm({
  action,
  outstanding,
  today,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  outstanding: string;
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          name="amount"
          label="المبلغ"
          type="number"
          required
          dir="ltr"
          defaultValue={outstanding}
          hint={`المتبقي ${outstanding}`}
          errors={state.fieldErrors}
        />
        <Select
          name="method"
          label="طريقة السداد"
          required
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_AR[m] }))}
          defaultValue="CASH"
          errors={state.fieldErrors}
        />
        <Field
          name="paidAt"
          label="تاريخ السداد"
          type="date"
          dir="ltr"
          defaultValue={today}
          errors={state.fieldErrors}
        />
        <Field
          name="reference"
          label="المرجع"
          placeholder="رقم الشيك أو التحويل"
          errors={state.fieldErrors}
        />
      </div>

      <TextArea name="notes" label="ملاحظات" rows={2} />

      <div className="flex items-center gap-3">
        <SubmitButton label="تسجيل الدفعة" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}

/** إلغاء فاتورة — سبب إلزامي. */
export function VoidForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <TextArea name="reason" label="سبب الإلغاء (إلزامي)" rows={2} errors={state.fieldErrors} />
      <button
        type="submit"
        className="rounded-lg border border-bad px-4 py-2 text-xs text-bad hover:bg-bad-soft"
      >
        إلغاء الفاتورة
      </button>
      <p className="text-[0.7rem] text-txt-4">
        الرقم لا يُعاد استخدامه أبداً. الفاتورة الملغاة تبقى في التسلسل كدليل على أن
        لا رقم قُفز — وهذا هو الغرض من الترقيم المتصل.
      </p>
      {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
    </form>
  );
}
