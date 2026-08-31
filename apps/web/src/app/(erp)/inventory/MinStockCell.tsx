'use client';

import { useActionState } from 'react';
import { setMinStock, type FormState } from './actions';

/**
 * تحرير الحدّ الأدنى (حدّ إعادة الطلب) لرصيد منتج مباشرة في الجدول. الحفظ
 * يُحدّث القيمة، وعند بلوغها أو تحتها يظهر الصنف في «نواقص وإعادة الطلب».
 */
export function MinStockCell({ stockId, value }: { stockId: string; value: number }) {
  const [state, formAction] = useActionState<FormState, FormData>(setMinStock.bind(null, stockId), {});
  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input
        name="minStock"
        type="number"
        min="0"
        step="1"
        dir="ltr"
        defaultValue={value}
        className="erp-input w-16 py-1 text-start text-xs"
      />
      <button type="submit" className="text-[0.7rem] text-brand hover:underline">حفظ</button>
      {state.ok && <span className="text-[0.7rem] text-ok">✓</span>}
      {state.error && <span className="text-[0.7rem] text-bad">✕</span>}
    </form>
  );
}
