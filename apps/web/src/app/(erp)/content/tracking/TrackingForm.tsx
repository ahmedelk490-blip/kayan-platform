'use client';

import { useActionState } from 'react';
import { SubmitButton, FormError } from '@/components/crud/Form';
import { saveTracking, type TrackingFormState } from './actions';

export interface TrackingField {
  name: string;
  label: string;
  placeholder: string;
  help: string;
  value: string;
}

/** نموذج أكواد التتبّع — صفّ لكل منصّة: الاسم وحالتها والحقل وشرح مكان الكود. */
export function TrackingForm({ fields }: { fields: TrackingField[] }) {
  const [state, action] = useActionState<TrackingFormState, FormData>(saveTracking, {});

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <div className="erp-card divide-y divide-line">
        {fields.map((f) => (
          <label key={f.name} className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:gap-6">
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-txt">
                {f.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${f.value ? 'bg-ok-soft text-ok' : 'bg-card-2 text-txt-4'}`}>
                  {f.value ? 'مفعّل' : 'متوقف'}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-[1.8] text-txt-3">{f.help}</span>
            </span>
            <span>
              <input
                name={f.name}
                defaultValue={f.value}
                placeholder={f.placeholder}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                className="erp-input py-2.5 text-start font-mono text-sm"
              />
              {state.fieldErrors?.[f.name] && (
                <span className="mt-1 block text-xs text-bad">{state.fieldErrors[f.name]}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="حفظ الأكواد" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
