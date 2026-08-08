'use client';

import { useActionState } from 'react';
import { Field, Select, SubmitButton, FormError } from '@/components/crud/Form';
import { linkProduct, type FormState } from '../actions';

export function LinkProductForm({
  supplierId,
  products,
}: {
  supplierId: string;
  products: { value: string; label: string }[];
}) {
  const bound = linkProduct.bind(null, supplierId);
  const [state, formAction] = useActionState<FormState, FormData>(bound, {});

  if (products.length === 0) {
    return <p className="text-xs text-txt-3">كل المنتجات مرتبطة بالفعل.</p>;
  }

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormError message={state.error} />
      <Select
        name="productId"
        label="المنتج"
        required
        options={products}
        placeholder="اختر المنتج"
        errors={state.fieldErrors}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="supplierSku" label="كود المورّد" dir="ltr" />
        <Field name="lastPrice" label="آخر سعر" type="number" dir="ltr" />
        <Field name="leadTimeDays" label="مدة التوريد (يوم)" type="number" dir="ltr" />
      </div>
      <SubmitButton label="ربط" />
    </form>
  );
}
