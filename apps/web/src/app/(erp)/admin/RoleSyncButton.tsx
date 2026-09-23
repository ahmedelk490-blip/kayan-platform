'use client';

import { useActionState } from 'react';
import { syncRoles, type RoleSyncState } from './role-actions';

/**
 * زر مزامنة الأدوار — يُنشئ في قاعدة البيانات ما أُضيف في الكود.
 *
 * بدونه يفشل إنشاء حسابٍ بدورٍ جديد برسالة «الدور غير موجود في قاعدة
 * البيانات»، وهي رسالةٌ لا يملك المستخدم حيالها شيئاً.
 */
export function RoleSyncButton() {
  const [state, action, pending] = useActionState<RoleSyncState, FormData>(() => syncRoles(), {});

  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className="erp-btn-ghost disabled:opacity-50">
        {pending ? 'جارٍ المزامنة…' : '🔄 مزامنة الأدوار والصلاحيات'}
      </button>
      <p className="text-[0.7rem] leading-[1.8] text-txt-4">
        تُتيح الأدوار الجديدة عند إنشاء الحسابات وتُحدِّث مصفوفة الصلاحيات المعروضة أدناه.
        آمنة للتكرار — لا تحذف دوراً عليه حسابات.
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
