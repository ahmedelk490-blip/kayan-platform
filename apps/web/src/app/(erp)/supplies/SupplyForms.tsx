'use client';

import { useActionState, useState } from 'react';
import {
  SUPPLY_KINDS,
  SUPPLY_KIND_AR,
  SUPPLY_CATEGORIES,
  SUPPLY_CATEGORY_AR,
  SUPPLY_TX_TYPES,
  SUPPLY_TX_TYPE_AR,
  type SupplyKind,
} from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '@/lib/ops';

/**
 * إضافة مستلزم.
 *
 * The category list follows the kind, so a thread can never be filed as a
 * printing supply — the separation the business asked for is enforced by the
 * picker as well as by the server.
 */
export function SupplyForm({
  action,
  defaults,
  submitLabel = 'إضافة',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** قيم أوّلية للتعديل؛ غيابها يعني نموذج إضافة جديد. */
  defaults?: { nameAr: string; kind: SupplyKind; category: string; unit: string; minStock: number };
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [kind, setKind] = useState<SupplyKind>(defaults?.kind ?? 'PRINTING');

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div>
          <label htmlFor="kind" className="mb-1.5 block text-xs text-txt-2">
            النوع <span className="ms-1 text-bad">*</span>
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as SupplyKind)}
            className="erp-input py-2.5"
          >
            {SUPPLY_KINDS.map((k) => (
              <option key={k} value={k}>
                {SUPPLY_KIND_AR[k]}
              </option>
            ))}
          </select>
        </div>

        <Select
          key={kind}
          name="category"
          label="الفئة"
          required
          // القيمة الأوّلية تُطبَّق فقط حين تخصّ نوع هذا المستلزم.
          defaultValue={defaults && defaults.kind === kind ? defaults.category : undefined}
          options={SUPPLY_CATEGORIES[kind].map((c) => ({
            value: c,
            label: SUPPLY_CATEGORY_AR[c] ?? c,
          }))}
          errors={state.fieldErrors}
        />
        <Field name="nameAr" label="الاسم" required defaultValue={defaults?.nameAr} errors={state.fieldErrors} />
        <Field name="unit" label="الوحدة" placeholder="رول · زجاجة · بكرة" defaultValue={defaults?.unit} errors={state.fieldErrors} />
        <Field name="minStock" label="حد أدنى" type="number" dir="ltr" defaultValue={String(defaults?.minStock ?? 0)} errors={state.fieldErrors} />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}

export function TransactionForm({
  action,
  supplies,
  productionOrders,
  today,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  supplies: { value: string; label: string }[];
  productionOrders: { value: string; label: string }[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [type, setType] = useState('PURCHASE');

  if (supplies.length === 0) {
    return <p className="text-sm text-txt-3">أضِف مستلزماً أولاً قبل تسجيل الحركات.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Select
          name="supplyId"
          label="المستلزم"
          required
          options={supplies}
          placeholder="اختر…"
          errors={state.fieldErrors}
        />
        <div>
          <label htmlFor="type" className="mb-1.5 block text-xs text-txt-2">
            نوع الحركة <span className="ms-1 text-bad">*</span>
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="erp-input py-2.5"
          >
            {SUPPLY_TX_TYPES.map((t) => (
              <option key={t} value={t}>
                {SUPPLY_TX_TYPE_AR[t]}
              </option>
            ))}
          </select>
        </div>
        <Field name="txDate" label="التاريخ" type="date" dir="ltr" defaultValue={today} errors={state.fieldErrors} />
        <Field name="quantity" label="الكمية" type="number" required dir="ltr" errors={state.fieldErrors} />
        <Field
          name="unitCost"
          label="تكلفة الوحدة (ج.م)"
          type="number"
          required
          dir="ltr"
          defaultValue="0"
          hint={type === 'PURCHASE' ? 'تُحدِّث آخر سعر معروف' : 'تكلفة الاستهلاك المحمَّلة'}
          errors={state.fieldErrors}
        />
        {type === 'CONSUMPTION' && (
          <Select
            name="productionOrderId"
            label="أمر الإنتاج (اختياري)"
            options={productionOrders}
            placeholder="غير مرتبط"
            errors={state.fieldErrors}
          />
        )}
      </div>

      <TextArea name="notes" label="ملاحظات" rows={2} />

      <div className="flex items-center gap-3">
        <SubmitButton label="تسجيل الحركة" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
