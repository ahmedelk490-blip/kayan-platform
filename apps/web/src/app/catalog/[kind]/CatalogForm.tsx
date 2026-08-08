'use client';

import { useActionState } from 'react';
import { Field, SubmitButton, FormError } from '@/components/crud/Form';
import { createCatalogItem, type FormState } from '../actions';
import type { Kind } from '../types';

/** Each vocabulary needs slightly different fields; this maps them. */
const SHAPE: Record<Kind, { extraLabel?: string; codeLabel?: string; extraHint?: string }> = {
  categories: { codeLabel: 'المعرّف (اختياري)' },
  colors: { extraLabel: 'كود اللون', extraHint: '#RRGGBB' },
  sizes: { codeLabel: 'الرمز (S / M / L)' },
  materials: { extraLabel: 'المواصفة' },
  printing: { extraLabel: 'ملاحظات' },
  embroidery: { extraLabel: 'ملاحظات' },
};

export function CatalogForm({ kind }: { kind: Kind }) {
  const bound = createCatalogItem.bind(null, kind);
  const [state, formAction] = useActionState<FormState, FormData>(bound, {});
  const shape = SHAPE[kind];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.error} />
      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          {state.ok}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="nameAr" label="الاسم بالعربية" required errors={state.fieldErrors} />
        {kind !== 'sizes' && <Field name="nameEn" label="الاسم بالإنجليزية" dir="ltr" errors={state.fieldErrors} />}
        {shape.codeLabel && (
          <Field name="code" label={shape.codeLabel} dir="ltr" errors={state.fieldErrors} />
        )}
        {shape.extraLabel && (
          <Field name="extra" label={shape.extraLabel} hint={shape.extraHint} errors={state.fieldErrors} />
        )}
      </div>

      <SubmitButton label="إضافة" />
    </form>
  );
}
