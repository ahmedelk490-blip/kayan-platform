'use client';

import { useActionState } from 'react';
import { setPenaltyPlan } from './actions';
import type { FormState } from '@/lib/ops';

/**
 * خطّة تقسيط الجزاء — عدد الأقساط الشهرية.
 *
 * الجزاء المعتمد كان يُستقطع دفعةً واحدة ولا سبيل لتعديله: جزاءٌ يعادل راتب
 * شهر يترك الموظّف بلا شيء، ومن اعتمده لم يُرِد ذلك. فالمبلغ يبقى كما
 * اعتُمد — هو قرارٌ اتُّخذ — وتُعدَّل وتيرة قبضه ما دام لم يُستوفَ.
 */
export function PenaltyPlanForm({
  damageId,
  penaltyId,
  installments,
  perInstallment,
}: {
  damageId: string;
  penaltyId: string;
  installments: number;
  /** قيمة القسط الواحد مهيّأةً للعرض. */
  perInstallment: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setPenaltyPlan.bind(null, damageId, penaltyId),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-1">
      <span className="flex items-center gap-1">
        <input
          name="installments"
          type="number"
          min="1"
          max="36"
          dir="ltr"
          defaultValue={installments}
          className="erp-input w-14 py-1 text-center text-xs"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-line-2 px-2 py-1 text-[0.65rem] text-txt-3 hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {pending ? '…' : 'حفظ'}
        </button>
      </span>
      <span className="tnum text-[0.65rem] text-txt-4">القسط {perInstallment}</span>
      {state.fieldErrors?.installments && (
        <span className="text-[0.65rem] text-bad">{state.fieldErrors.installments}</span>
      )}
      {state.error && <span className="text-[0.65rem] text-bad">{state.error}</span>}
      {state.ok && <span className="text-[0.65rem] text-ok">{state.ok}</span>}
    </form>
  );
}
