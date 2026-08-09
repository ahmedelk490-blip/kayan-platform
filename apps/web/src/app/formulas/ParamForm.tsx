'use client';

import { useActionState, useState } from 'react';
import { FORMULA_PARAM_KEYS, FORMULA_PARAMS, type FormulaParamKey } from '@erp/domain';
import { Field, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/**
 * معامل الإصدار.
 *
 * The four keys the engine understands are offered as buttons that fill the
 * form; anything else can still be typed. Nothing is pre-filled with a
 * number — an invented default would produce a confident cost nobody chose.
 */
export function ParamForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [preset, setPreset] = useState<FormulaParamKey | null>(null);

  const known = preset ? FORMULA_PARAMS[preset] : null;

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="flex flex-wrap gap-2">
        {FORMULA_PARAM_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset(k)}
            className={
              preset === k
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {FORMULA_PARAMS[k].nameAr}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Field
          key={`key-${preset ?? 'custom'}`}
          name="key"
          label="المفتاح"
          required
          dir="ltr"
          defaultValue={preset ?? ''}
          hint="بالإنجليزية — يقرأه المحرك"
          errors={state.fieldErrors}
        />
        <Field
          key={`name-${preset ?? 'custom'}`}
          name="nameAr"
          label="الاسم"
          required
          defaultValue={known?.nameAr ?? ''}
          errors={state.fieldErrors}
        />
        <Field name="value" label="القيمة" type="number" required dir="ltr" errors={state.fieldErrors} />
        <Field
          key={`unit-${preset ?? 'custom'}`}
          name="unit"
          label="الوحدة"
          defaultValue={known?.unit ?? ''}
          errors={state.fieldErrors}
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="حفظ المعامل" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
