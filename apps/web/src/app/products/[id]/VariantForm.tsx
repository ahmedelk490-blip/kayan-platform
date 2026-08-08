'use client';

import { useActionState } from 'react';
import { Field, Select, SubmitButton, FormError } from '@/components/crud/Form';
import { createVariant, type FormState } from '../actions';

export function VariantForm({
  productId,
  colors,
  sizes,
}: {
  productId: string;
  colors: { value: string; label: string }[];
  sizes: { value: string; label: string }[];
}) {
  const bound = createVariant.bind(null, productId);
  const [state, formAction] = useActionState<FormState, FormData>(bound, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="sku" label="كود المتغيّر" required dir="ltr" errors={state.fieldErrors} />
        <Field name="barcode" label="الباركود" dir="ltr" errors={state.fieldErrors} />
        <Select name="colorId" label="اللون" options={colors} placeholder="بدون لون" />
        <Select name="sizeId" label="المقاس" options={sizes} placeholder="بدون مقاس" />
        <Field name="cost" label="التكلفة" type="number" dir="ltr" />
        <Field name="sellingPrice" label="سعر البيع" type="number" dir="ltr" />
      </div>
      <SubmitButton label="إضافة متغيّر" />
    </form>
  );
}
