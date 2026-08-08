'use client';

import { useActionState } from 'react';
import {
  Field,
  TextArea,
  Select,
  CheckboxGroup,
  SubmitButton,
  FormError,
} from '@/components/crud/Form';
import type { FormState } from './actions';

export interface Option {
  value: string;
  label: string;
}

export interface ProductValues {
  nameAr?: string | null;
  nameEn?: string | null;
  sku?: string | null;
  barcode?: string | null;
  categoryId?: string | null;
  descriptionAr?: string | null;
  cost?: number | null;
  sellingPrice?: number | null;
  status?: string | null;
}

const STATUSES: Option[] = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'DRAFT', label: 'مسودة' },
  { value: 'DISCONTINUED', label: 'متوقف' },
];

export function ProductForm({
  action,
  values,
  categories,
  materials,
  printingOptions,
  embroideryOptions,
  selected,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: ProductValues;
  categories: Option[];
  materials: Option[];
  printingOptions: Option[];
  embroideryOptions: Option[];
  selected?: { materials: string[]; printing: string[]; embroidery: string[] };
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="nameAr" label="الاسم بالعربية" required errors={state.fieldErrors} defaultValue={values?.nameAr} />
        <Field name="nameEn" label="الاسم بالإنجليزية" dir="ltr" errors={state.fieldErrors} defaultValue={values?.nameEn} />
        <Field name="sku" label="الكود (SKU)" required dir="ltr" errors={state.fieldErrors} defaultValue={values?.sku} />
        <Field name="barcode" label="الباركود" dir="ltr" errors={state.fieldErrors} defaultValue={values?.barcode} />
        <Select
          name="categoryId"
          label="التصنيف"
          required
          options={categories}
          placeholder="اختر التصنيف"
          errors={state.fieldErrors}
          defaultValue={values?.categoryId}
        />
        <Select
          name="status"
          label="الحالة"
          options={STATUSES}
          errors={state.fieldErrors}
          defaultValue={values?.status ?? 'ACTIVE'}
        />
        <Field
          name="cost"
          label="التكلفة"
          type="number"
          dir="ltr"
          errors={state.fieldErrors}
          defaultValue={values?.cost ?? ''}
          hint="تُخزَّن فقط — محرك التكلفة لم يُبنَ بعد"
        />
        <Field
          name="sellingPrice"
          label="سعر البيع"
          type="number"
          dir="ltr"
          errors={state.fieldErrors}
          defaultValue={values?.sellingPrice ?? ''}
        />
      </div>

      <TextArea name="descriptionAr" label="الوصف" errors={state.fieldErrors} defaultValue={values?.descriptionAr} />

      <div className="space-y-4 border-t border-line pt-5">
        <CheckboxGroup name="materials" label="الخامات" options={materials} selected={selected?.materials} />
        <CheckboxGroup
          name="printingOptions"
          label="خيارات الطباعة"
          options={printingOptions}
          selected={selected?.printing}
        />
        <CheckboxGroup
          name="embroideryOptions"
          label="خيارات التطريز"
          options={embroideryOptions}
          selected={selected?.embroidery}
        />
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
