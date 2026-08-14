'use client';

import { useActionState, useState } from 'react';
import {
  COST_CATEGORIES,
  COST_CATEGORY_AR,
  COST_BASES,
  COST_BASIS_AR,
  FORMULA_PARAM_KEYS,
  FORMULA_PARAMS,
  requiresYield,
  requiresParams,
  type CostBasis,
} from '@erp/domain';
import { Field, Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/**
 * إضافة بند تكلفة.
 *
 * The basis selector changes which inputs matter, so the form says so
 * instead of leaving a field that is silently ignored. `yieldQty` only
 * appears for PER_YIELD; the percentage bases relabel the quantity field.
 */
export function LineForm({
  action,
  materials,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  materials: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [basis, setBasis] = useState<CostBasis>('PER_PIECE');

  const isPercent = basis === 'PERCENT_OF_DIRECT';
  const neededParams = requiresParams(basis);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Select
          name="category"
          label="بند التكلفة"
          required
          options={COST_CATEGORIES.map((c) => ({ value: c, label: COST_CATEGORY_AR[c] }))}
          defaultValue="MATERIAL"
          errors={state.fieldErrors}
        />
        <Field
          name="nameAr"
          label="الوصف"
          required
          placeholder="قماش قطن ١٨٠ جم — حبر أبيض — أجر خياطة"
          errors={state.fieldErrors}
        />
        <div>
          <label htmlFor="basis" className="mb-1.5 block text-xs text-txt-2">
            أساس الحساب <span className="ms-1 text-bad">*</span>
          </label>
          <select
            id="basis"
            name="basis"
            required
            value={basis}
            onChange={(e) => setBasis(e.target.value as CostBasis)}
            className="erp-input py-2.5"
          >
            {COST_BASES.map((b) => (
              <option key={b} value={b}>
                {COST_BASIS_AR[b]}
              </option>
            ))}
          </select>
        </div>

        <Field
          name="quantity"
          label={isPercent ? 'النسبة ٪' : 'الكمية لكل وحدة أساس'}
          type="number"
          required
          dir="ltr"
          defaultValue=""
          errors={state.fieldErrors}
        />

        {requiresYield(basis) && (
          <Field
            name="yieldQty"
            label="عدد القطع المنتَجة من هذه الكمية"
            type="number"
            required
            dir="ltr"
            hint="رول ٥٠ متر يكفي ٤٠٠ قطعة ← الكمية ٥٠، هذا الحقل ٤٠٠"
            errors={state.fieldErrors}
          />
        )}

        {!isPercent && (
          <>
            <Field
              name="unit"
              label="الوحدة"
              placeholder="متر · جرام · دقيقة"
              errors={state.fieldErrors}
            />
            <Field
              name="unitCost"
              label="تكلفة الوحدة (ج.م)"
              type="number"
              required
              dir="ltr"
              defaultValue=""
              errors={state.fieldErrors}
            />
          </>
        )}

        {materials.length > 0 && !isPercent && (
          <Select
            name="materialId"
            label="ربط بخامة (اختياري)"
            options={materials}
            placeholder="بدون ربط"
            errors={state.fieldErrors}
          />
        )}
      </div>

      {isPercent && (
        <p className="rounded-lg border border-line bg-card-2 px-4 py-3 text-[0.7rem] text-txt-3">
          يُحسب هذا البند كنسبة من إجمالي البنود المباشرة، بعد حسابها كلها. لا يُحسب على
          بنود نسبية أخرى، حتى لا تتغيّر النتيجة بترتيب الصفوف.
        </p>
      )}

      {neededParams.length > 0 && (
        <p className="rounded-lg border border-line bg-card-2 px-4 py-3 text-[0.7rem] text-txt-3">
          هذا الأساس يقرأ معاملات الإصدار:{' '}
          {neededParams
            .filter((k): k is (typeof FORMULA_PARAM_KEYS)[number] =>
              (FORMULA_PARAM_KEYS as readonly string[]).includes(k),
            )
            .map((k) => FORMULA_PARAMS[k].nameAr)
            .join(' · ')}
          . أضِفها في قسم المعاملات، وإلا حُسب البند بصفر.
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton label="إضافة البند" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
