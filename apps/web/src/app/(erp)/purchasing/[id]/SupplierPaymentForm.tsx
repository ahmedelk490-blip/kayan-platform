'use client';

import { useActionState } from 'react';
import { PAYMENT_METHODS, PAYMENT_METHOD_AR } from '@erp/domain';
import { Field, SubmitButton, FormError } from '@/components/crud/Form';
import { recordSupplierPayment } from '../payment-actions';
import type { FormState } from '../shared';

/**
 * تسجيل دفعة لمورّد على أمر شراء.
 *
 * مرآةُ نموذج تحصيل العميل: نفس الحقول ونفس السقف ونفس الرسائل — فمن عرف
 * أحدهما عرف الآخر، ولا يتعلّم المستخدم شاشتين لفعلٍ واحد باتجاهين.
 */
export function SupplierPaymentForm({
  purchaseOrderId,
  remaining,
}: {
  purchaseOrderId: string;
  /** المتبقي على الأمر مهيَّأً للعرض — سقف ما يُقبل. */
  remaining: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    recordSupplierPayment.bind(null, purchaseOrderId),
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="amount"
          label="المبلغ المدفوع"
          type="number"
          dir="ltr"
          errors={state.fieldErrors}
          hint={`المتبقي ${remaining}`}
        />
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">طريقة الدفع</span>
          <select name="method" className="erp-input py-2.5" defaultValue="CASH">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_AR[m]}
              </option>
            ))}
          </select>
        </label>
        <Field name="paidAt" label="تاريخ الدفع" type="date" dir="ltr" errors={state.fieldErrors} />
        <Field name="reference" label="المرجع (اختياري)" errors={state.fieldErrors} />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="سجّل الدفعة" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
