'use client';

import { useActionState } from 'react';
import { PRIORITIES, PRIORITY_AR } from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

export interface Option {
  value: string;
  label: string;
}

/**
 * أمر إنتاج — إنشاء أو تعديل.
 *
 * One variant and one quantity per order. Splitting a sales order across
 * several production orders is done by creating several — which is what a
 * factory actually does when a line is run in batches.
 */
export function ProductionForm({
  action,
  variants,
  salesOrders,
  defaults,
  submitLabel = 'حفظ',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  variants: Option[];
  salesOrders: Option[];
  defaults?: {
    variantId?: string | null;
    quantity?: number;
    priority?: string;
    salesOrderId?: string | null;
    plannedStartDate?: string | null;
    plannedEndDate?: string | null;
    notes?: string | null;
  };
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);

  if (variants.length === 0) {
    return (
      <p className="text-sm text-txt-3">
        لا توجد متغيّرات منتجات نشطة. أضِف منتجاً ومتغيّراته أولاً قبل إنشاء أمر إنتاج.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <div className="grid gap-5 md:grid-cols-2">
        <Select
          name="variantId"
          label="المنتج / المتغيّر"
          required
          options={variants}
          defaultValue={defaults?.variantId ?? ''}
          placeholder="اختر متغيّراً…"
          errors={state.fieldErrors}
        />
        <Field
          name="quantity"
          label="الكمية المطلوب إنتاجها"
          type="number"
          required
          dir="ltr"
          defaultValue={defaults?.quantity ?? ''}
          errors={state.fieldErrors}
        />
        <Select
          name="priority"
          label="الأولوية"
          required
          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_AR[p] }))}
          defaultValue={defaults?.priority ?? 'NORMAL'}
          errors={state.fieldErrors}
        />
        <Select
          name="salesOrderId"
          label="أمر البيع المرتبط"
          options={salesOrders}
          defaultValue={defaults?.salesOrderId ?? ''}
          placeholder="بدون — إنتاج للمخزون"
          errors={state.fieldErrors}
        />
        <Field
          name="plannedStartDate"
          label="بداية مخططة"
          type="date"
          dir="ltr"
          defaultValue={defaults?.plannedStartDate ?? ''}
          errors={state.fieldErrors}
        />
        <Field
          name="plannedEndDate"
          label="نهاية مخططة"
          type="date"
          dir="ltr"
          defaultValue={defaults?.plannedEndDate ?? ''}
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
