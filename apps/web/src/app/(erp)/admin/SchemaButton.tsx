'use client';

import { useActionState } from 'react';
import { applyPendingSchema, type SchemaState } from './schema-actions';

/**
 * زرّ تطبيق بنية قاعدة البيانات — يُضغط مرّةً بعد كل تحديث يضيف جدولاً.
 *
 * خطّ النشر يبني الكود ولا يُطبّق الترحيلات، فالميزة الجديدة تصل الخادم قبل
 * جدولها. هذه تُكمل الناقص من هنا بدل سطر أوامر لا يُفتح.
 */
export function SchemaButton() {
  const [state, action, pending] = useActionState<SchemaState, FormData>(
    () => applyPendingSchema(),
    {},
  );

  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className="erp-btn-ghost disabled:opacity-50">
        {pending ? 'جارٍ التطبيق…' : '🗄 تحديث بنية قاعدة البيانات'}
      </button>
      <p className="text-[0.7rem] leading-[1.8] text-txt-4">
        يضيف ما نقص من جداول وأعمدة بعد تحديثٍ جديد — مثل دفعات الموردين. يفحص
        الموجود أوّلاً فلا يكرّر شيئاً، ولا يمسّ بياناتك. آمن للتكرار.
      </p>
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
