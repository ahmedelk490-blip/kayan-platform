'use client';

import { useActionState } from 'react';
import { applyPendingSchema, type SchemaState } from './admin/schema-actions';

/**
 * حدُّ الخطأ للنظام كلّه — شاشةٌ تقول ما العمل بدل «Application error».
 *
 * ── لماذا هذا لازم ────────────────────────────────────────
 *
 * سقوطُ استعلامٍ واحد في صفحةٍ واحدة كان يُخرج صفحةً بيضاء فيها سطرٌ
 * إنجليزيّ ورقمُ digest لا يعني شيئاً لصاحب النظام: لا يقول ما الخطب، ولا
 * ما العمل، ولا حتى أيّ جزءٍ سقط. وإن كانت الشاشة الساقطة هي أوّل ما يُفتح
 * بعد الدخول، وقف النظام كلّه.
 *
 * فصار الخطأ يُقال بالعربية، ومعه فعلان: إعادة المحاولة، وتطبيق بنية قاعدة
 * البيانات — لأن أشيع أسباب السقوط بعد تحديثٍ جديد عمودٌ لم يصل بعد (خطّ
 * النشر يبني الكود ولا يُطبّق الترحيلات). والزرّ هنا لا في شاشةٍ أخرى قد
 * تكون ساقطةً هي الأخرى.
 *
 * ولا يُخفي الخطأ: رقم الـdigest يبقى معروضاً صغيراً، فهو ما يُبحث به في
 * سجلّ الخادم.
 */
export default function ErpError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [state, action, pending] = useActionState<SchemaState, FormData>(
    () => applyPendingSchema(),
    {},
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-10">
      <div className="erp-card border-bad p-6">
        <h1 className="mb-2 text-base font-semibold text-bad">تعذّر عرض هذه الشاشة</h1>
        <p className="text-xs leading-[1.9] text-txt-2">
          حدث خطأ أثناء تحميل البيانات. جرّب إعادة المحاولة أوّلاً. وإن تكرّر بعد تحديثٍ
          جديد، فالأرجح أن بنية قاعدة البيانات لم تُطبَّق بعد — اضغط «طبّق البنية».
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="erp-btn">
            إعادة المحاولة
          </button>
          <form action={action}>
            <button type="submit" disabled={pending} className="erp-btn-ghost disabled:opacity-50">
              {pending ? 'جارٍ التطبيق…' : '🗄 طبّق البنية'}
            </button>
          </form>
          <a href="/dashboard" className="erp-btn-ghost">
            لوحة المدير
          </a>
        </div>

        {state.ok && (
          <p role="status" className="mt-3 rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
            {state.ok} — اضغط «إعادة المحاولة».
          </p>
        )}
        {state.error && (
          <p role="alert" className="mt-3 rounded-lg border border-bad bg-bad-soft px-4 py-2.5 text-xs text-bad">
            {state.error}
          </p>
        )}

        {error.digest && (
          <p className="mt-4 text-[0.65rem] text-txt-4" dir="ltr">
            digest: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
