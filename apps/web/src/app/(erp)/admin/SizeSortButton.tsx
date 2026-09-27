'use client';

import { useActionState } from 'react';
import { sortSizes, type SizeSortState } from './size-actions';

/**
 * زرّ ترتيب المقاسات — من الأصغر للأكبر بسُلّمها المعروف، وإخفاء ما يُكتب.
 *
 * المقاسات القديمة أُدخِلت بلا ترتيب، ولا شاشة في النظام تضبطه — فهذه تكتبه
 * مرّةً واحدة لكل ما هو مُدخَل. والمقاسات الجديدة تُرتَّب من نفسها عند إضافتها.
 */
export function SizeSortButton() {
  const [state, action, pending] = useActionState<SizeSortState, FormData>(sortSizes, {});

  return (
    <form action={action} className="space-y-2">
      <label className="block">
        <span className="mb-1.5 block text-xs text-txt-2">مقاسات تُخفى (اتركها فارغة للترتيب وحده)</span>
        <input
          name="hide"
          defaultValue="S"
          dir="ltr"
          placeholder="S, XS"
          className="erp-input w-40 py-2 text-start text-xs"
        />
      </label>
      <button type="submit" disabled={pending} className="erp-btn-ghost disabled:opacity-50">
        {pending ? 'جارٍ الترتيب…' : '↕ رتّب المقاسات'}
      </button>
      <p className="text-[0.7rem] leading-[1.8] text-txt-4">
        يرتّب المقاسات من الأصغر للأكبر (L ← XL ← 2XL ← 3XL ← 4XL ← 5XL) في الفواتير
        والمخزون والسيريات. وما تكتبه في الخانة يغيب من قوائم الاختيار — حذفٌ ليّن،
        الفواتير القديمة التي تحمله تبقى كما هي. آمن للتكرار.
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
