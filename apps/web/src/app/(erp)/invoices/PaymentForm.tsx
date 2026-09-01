'use client';

import { useActionState, useState } from 'react';
import { PAYMENT_METHODS, PAYMENT_METHOD_AR } from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/**
 * تسجيل دفعة.
 *
 * The outstanding balance is offered as the default because "they paid the
 * rest" is the common case. The server re-checks it — the default is a
 * convenience, never the control.
 *
 * الحقول مضبوطة من الحالة عمداً: خطأُ تحقق من الخادم كان يعيد تعيين الفورم
 * فيمسح المبلغ والمرجع والملاحظات المكتوبة (سلوك React 19 مع الفورمات الحرّة).
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
  const [amount, setAmount] = useState(outstanding);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

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
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
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
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          errors={state.fieldErrors}
        />
      </div>

      <TextArea name="notes" label="ملاحظات" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

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
  const [reason, setReason] = useState('');

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <TextArea
        name="reason"
        label="سبب الإلغاء (إلزامي)"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        errors={state.fieldErrors}
      />
      <button
        type="submit"
        onClick={(e) => {
          if (!window.confirm('إلغاء الفاتورة نهائياً؟ الرقم يبقى محجوزاً ولا يُتراجع عن الإلغاء.')) e.preventDefault();
        }}
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
