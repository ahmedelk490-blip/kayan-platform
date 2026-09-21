'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { postMovement, type FormState } from '@/app/(erp)/inventory/actions';

/**
 * إضافة رصيد بالدست من صف المتغيّر نفسه.
 *
 * الطريق القديم: اذهب للمخزون، ابحث عن «يلك أسود L» بين مئات المتغيّرات، ثم
 * أدخل الكمية. وهنا المتغيّر معروف سلفاً — فيكفي عدد الدست، وتُحسب القطع من
 * قطع دستة المنتج وتُرسل حركة استلام واحدة.
 *
 * الكمية المرسلة قطعٌ دائماً (الخادم لا يعرف الدست)، والحساب معروض قبل الإرسال
 * فلا يُضاف رقم لم يره المستخدم.
 */
export function AddDozenStock({
  variantId,
  perDozen,
  label,
}: {
  variantId: string;
  /** قطع الدستة لهذا المنتج — من نظام الدستة في بطاقته. */
  perDozen: number;
  /** اسم المتغيّر — يدخل بيان الحركة ليُقرأ في سجل المخزون. */
  label: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(postMovement, {});
  const per = perDozen > 0 ? perDozen : 12;

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="type" value="RECEIPT" />
      <input type="hidden" name="reason" value={`إضافة بالدست — ${label}`} />

      <div className="flex items-center gap-1.5">
        <DozenInput per={per} />
        <AddButton />
      </div>

      {state.ok && <span className="text-[0.65rem] text-ok">{state.ok}</span>}
      {state.error && <span className="text-[0.65rem] text-bad">{state.error}</span>}
      {state.fieldErrors?.quantity && (
        <span className="text-[0.65rem] text-bad">{state.fieldErrors.quantity}</span>
      )}
    </form>
  );
}

/**
 * خانة الدست: تكتب عدد الدست وترى القطع تحتها، والقيمة المرسَلة هي القطع.
 * غير محكومة بحالة React — فالنموذج يُفرَّغ من تلقائه بعد كل إضافة ناجحة.
 */
function DozenInput({ per }: { per: number }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[0.65rem] text-txt-3">دست</span>
      <input
        type="number"
        min="1"
        step="1"
        dir="ltr"
        defaultValue=""
        placeholder="0"
        required
        onChange={(e) => {
          const dozens = Math.max(0, Math.round(Number(e.target.value) || 0));
          const hidden = e.currentTarget.form?.elements.namedItem('quantity');
          const hint = e.currentTarget.form?.querySelector('[data-pieces]');
          if (hidden instanceof HTMLInputElement) hidden.value = String(dozens * per);
          if (hint) hint.textContent = dozens > 0 ? `= ${dozens * per} قطعة` : '';
        }}
        className="erp-input w-16 py-1.5 text-start text-xs"
        title={`الدستة = ${per} قطعة`}
      />
      <input type="hidden" name="quantity" defaultValue="" />
      <span data-pieces className="tnum min-w-14 text-[0.65rem] text-brand" />
    </label>
  );
}

/** الزر يتعطّل أثناء الإرسال — ضغطتان لا تضيفان الرصيد مرتين. */
function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-ok px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      title="إضافة للمخزون"
    >
      {pending ? '…' : '+ أضف'}
    </button>
  );
}
