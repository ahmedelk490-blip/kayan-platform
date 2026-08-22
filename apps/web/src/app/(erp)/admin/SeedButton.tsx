'use client';

import { useActionState } from 'react';
import { seedCatalogAndFormulas, type SeedState } from './seed-actions';

/**
 * زر تهيئة الأسعار والألوان والمقاسات والمعادلات على قاعدة البيانات الحيّة.
 *
 * بديل عن SSH الذي يقطعه المضيف: التهيئة تعمل داخل التطبيق. آمنة للتكرار.
 */
export function SeedButton() {
  const [state, action, pending] = useActionState<SeedState, FormData>(
    () => seedCatalogAndFormulas(),
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <p className="text-xs leading-[1.9] text-txt-3">
        يضبط أسعار المنتجات (تطريز/DTF حسب الكمية) ويضيف الألوان والمقاسات كمتغيّرات في
        المخزون، وينشئ معادلتَي تكلفة الطباعة والتطريز القابلتين للتعديل. آمن للتكرار — لا
        يُكرّر الموجود.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="erp-btn disabled:opacity-50"
      >
        {pending ? 'جارٍ التهيئة…' : 'تهيئة الأسعار والألوان والمعادلات'}
      </button>
      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-lg border border-bad bg-bad-soft px-4 py-2.5 text-xs text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
