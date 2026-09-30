'use client';

import { useActionState, useState } from 'react';
import { correctMovement, type FormState } from './actions';

/**
 * «تعديل» كمية حركةٍ أُدخلت غلطاً — في مكانها من السجل.
 *
 * مطويٌّ حتى يُضغط: السجل يُقرأ أكثر مما يُعدَّل، وخانةٌ مفتوحة في كل صفّ
 * تدعو إلى تعديلٍ بالخطأ.
 */
export function CorrectMovementForm({ movementId, quantity }: { movementId: string; quantity: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    correctMovement.bind(null, movementId),
    {},
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand hover:underline">
        تعديل
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input
        name="quantity"
        type="number"
        min="1"
        step="1"
        dir="ltr"
        defaultValue={quantity}
        autoFocus
        className="erp-input w-20 py-1 text-center text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-brand px-2 py-1 text-[0.7rem] text-brand disabled:opacity-50"
      >
        {pending ? '…' : 'حفظ'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[0.7rem] text-txt-4 hover:underline">
        إلغاء
      </button>
      {(state.fieldErrors?.quantity || state.error) && (
        <span className="block w-full text-[0.65rem] text-bad">{state.fieldErrors?.quantity ?? state.error}</span>
      )}
      {state.ok && <span className="block w-full text-[0.65rem] text-ok">{state.ok}</span>}
    </form>
  );
}
