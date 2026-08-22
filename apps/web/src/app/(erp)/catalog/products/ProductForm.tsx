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
import { useFormSuccess } from '@/components/crud/useFormSuccess';
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
  colors = [],
  sizes = [],
  selected,
  showVariants = false,
  submitLabel,
  onSuccess,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: ProductValues;
  categories: Option[];
  materials: Option[];
  printingOptions: Option[];
  embroideryOptions: Option[];
  colors?: Option[];
  sizes?: Option[];
  selected?: { materials: string[]; printing: string[]; embroidery: string[] };
  /**
   * تُعرض خانات الألوان والمقاسات عند الإنشاء فقط — فهي تُنشئ المتغيّرات.
   * التعديل لا يعيد توليدها (تُدار من صفحة المنتج) فتبقى مخفيّة هناك.
   */
  showVariants?: boolean;
  submitLabel?: string;
  /** Supplied by the modal only. The full page leaves it undefined. */
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  useFormSuccess(state.ok, onSuccess);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormError message={state.error} />

      {/* الأساسي: الاسم، الكود، التصنيف، السعر — أربع خانات تكفي لإنشاء منتج. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="nameAr" label="اسم المنتج" required errors={state.fieldErrors} defaultValue={values?.nameAr} />
        <Field name="sku" label="الكود (SKU)" required dir="ltr" errors={state.fieldErrors} defaultValue={values?.sku} />
        <Select
          name="categoryId"
          label="التصنيف"
          required
          options={categories}
          placeholder="اختر التصنيف"
          errors={state.fieldErrors}
          defaultValue={values?.categoryId}
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

      {/* الألوان والمقاسات — تُنشئ المتغيّرات وتظهر في المخزون. عند الإنشاء فقط. */}
      {showVariants && (colors.length > 0 || sizes.length > 0) && (
        <div className="space-y-4 rounded-xl border border-line bg-card-2 p-4">
          <p className="text-xs text-txt-3">
            اختر ألوان المنتج ومقاساته — يُنشأ متغيّر لكل تركيبة ويظهر في المخزون تلقائياً.
          </p>
          <CheckboxGroup name="colorIds" label="الألوان" options={colors} />
          <CheckboxGroup name="sizeIds" label="المقاسات" options={sizes} />
        </div>
      )}

      {/* المتقدّم ومطويّ: بيانات لا تُطلب في كل منتج. */}
      <details className="rounded-xl border border-line bg-card-2 px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-txt-2">
          خيارات إضافية — الاسم الإنجليزي، الباركود، التكلفة، الحالة، الوصف، الخامات
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="nameEn" label="الاسم بالإنجليزية" dir="ltr" errors={state.fieldErrors} defaultValue={values?.nameEn} />
            <Field name="barcode" label="الباركود" dir="ltr" errors={state.fieldErrors} defaultValue={values?.barcode} />
            <Field
              name="cost"
              label="التكلفة"
              type="number"
              dir="ltr"
              errors={state.fieldErrors}
              defaultValue={values?.cost ?? ''}
              hint="تُخزَّن فقط — محرك التكلفة لم يُبنَ بعد"
            />
            <Select
              name="status"
              label="الحالة"
              options={STATUSES}
              errors={state.fieldErrors}
              defaultValue={values?.status ?? 'ACTIVE'}
            />
          </div>

          <TextArea name="descriptionAr" label="الوصف" errors={state.fieldErrors} defaultValue={values?.descriptionAr} />

          <div className="space-y-4 border-t border-line pt-4">
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
        </div>
      </details>

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        {state.ok && !onSuccess && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
