'use client';

import { useActionState } from 'react';
import { applyPendingSchema, type SchemaState } from '@/app/(erp)/admin/schema-actions';

/**
 * شاشةٌ تنتظر عموداً لم يصل بعد — بزرٍّ لا بانهيار.
 *
 * خطّ النشر يبني الكود ولا يُطبّق الترحيلات، فبين وصول الميزة ووصول جدولها
 * فجوةٌ زمنية. وكان أثرها أن تسقط الشاشة كلها بـ«Application error» — رسالةٌ
 * لا تقول ما الخطب ولا ما العمل، وتقطع وحدةً كاملة عن صاحبها.
 *
 * فصارت الفجوة تُقال وتُسدّ من مكانها: سطرٌ يشرح، وزرٌّ يُطبّق الناقص، ثم
 * تعود الشاشة. ولا يظهر هذا إلا إن كانت الفجوة قائمةً فعلاً.
 */
export function SchemaGap({ what }: { what: string }) {
  const [state, action, pending] = useActionState<SchemaState, FormData>(
    () => applyPendingSchema(),
    {},
  );

  return (
    <section className="erp-card border-warn bg-warn-soft p-6">
      <h3 className="mb-2 text-sm font-semibold text-warn">تحديثٌ يحتاج خطوةً واحدة</h3>
      <p className="mb-4 text-xs leading-[1.9] text-txt-2">
        {what} وصلت إلى النظام، وبنيتها في قاعدة البيانات لم تُطبَّق بعد. اضغط الزرّ
        لتطبيقها — لا تمسّ بياناتك، وآمنة للتكرار.
      </p>
      <form action={action}>
        <button type="submit" disabled={pending} className="erp-btn disabled:opacity-50">
          {pending ? 'جارٍ التطبيق…' : '🗄 طبّق الآن'}
        </button>
      </form>
      {state.ok && (
        <p role="status" className="mt-3 rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          {state.ok} — أعِد تحميل الصفحة.
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-bad bg-bad-soft px-4 py-2.5 text-xs text-bad">
          {state.error}
        </p>
      )}
    </section>
  );
}
