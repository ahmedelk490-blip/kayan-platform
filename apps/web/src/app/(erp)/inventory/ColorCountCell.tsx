'use client';

import { useActionState, useEffect, useState } from 'react';
import { setColorCount, zeroNegativeColors, type FormState } from './actions';

/**
 * عدد اللون في المخزون — رقمٌ واحد بلا مقاسات (بطلب المالك)، وبجانبه «جرد»
 * يكتب فيه العدد الموجود فعلاً فيصير هو رصيد اللون.
 */
export function ColorCountCell({
  productId,
  colorKey,
  total,
  canWrite,
}: {
  productId: string;
  colorKey: string;
  total: number;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setColorCount.bind(null, productId, colorKey),
    {},
  );
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  const tone =
    total < 0
      ? 'border-bad bg-bad-soft text-bad'
      : total === 0
        ? 'border-warn bg-warn-soft text-warn'
        : 'border-brand/40 bg-brand-soft text-brand';

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={`flex min-w-[4rem] flex-col items-center rounded-lg border px-3 py-1 ${tone}`}>
        <span className="text-xs leading-[1.3] opacity-80">العدد</span>
        {/* السالب يُقرأ «٣-» في سياق عربي، فيُثبَّت اتجاه الرقم. */}
        <span dir="ltr" className="tnum text-base font-bold leading-tight">
          {total}
        </span>
      </span>
      {canWrite &&
        (editing ? (
          <form action={formAction} className="flex items-center gap-1.5">
            <input
              name="count"
              type="number"
              min="0"
              step="1"
              dir="ltr"
              autoFocus
              defaultValue={Math.max(0, total)}
              aria-label="العدد الموجود فعلاً"
              className="erp-input w-20 py-1.5 text-start text-sm"
            />
            <button type="submit" disabled={pending} className="erp-btn-primary px-3 py-1.5 text-xs">
              {pending ? '…' : 'حفظ'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-txt-3 hover:underline">
              إلغاء
            </button>
            {state.error && <span className="text-xs text-bad">{state.error}</span>}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-8 rounded-lg border border-line-2 px-2.5 text-xs text-txt-2 hover:border-brand hover:text-brand"
          >
            ✎ جرد
          </button>
        ))}
    </span>
  );
}

/** زرار «تصفير السالب» — لموديلٍ واحد (productId) أو لكل الموديلات (null). */
export function ZeroNegativeButton({ productId, count }: { productId: string | null; count: number }) {
  const [pending, setPending] = useState(false);
  return (
    <form
      action={async () => {
        setPending(true);
        try {
          await zeroNegativeColors(productId);
        } finally {
          setPending(false);
        }
      }}
      onSubmit={(e) => {
        const msg = `تصفير ${count} لون بالسالب؟ يصير عددها صفراً بحركة «تسوية» مسجّلة (تقدر تعكسها من حركات المخزون). المبيعات والأرباح لا تتأثر.`;
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="min-h-8 rounded-lg border border-bad px-3 text-xs font-medium text-bad hover:bg-bad-soft"
      >
        {pending ? 'جارٍ التصفير…' : `تصفير السالب (${count} لون)`}
      </button>
    </form>
  );
}
