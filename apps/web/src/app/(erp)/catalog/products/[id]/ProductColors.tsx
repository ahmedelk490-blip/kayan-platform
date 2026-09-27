'use client';

import { useState, useTransition } from 'react';
import { toggleProductColor } from '../actions';

export interface ColorChoice {
  id: string;
  nameAr: string;
  hex: string | null;
  /** عدد مقاسات هذا اللون في هذا المنتج — صفر يعني أنه ليس من ألوانه. */
  variants: number;
}

/**
 * ألوان هذا الموديل — ضغطةٌ تضيف وضغطةٌ ترفع.
 *
 * كان اللون يُضاف بنموذجٍ يُختار فيه اللون والمقاسات معاً ويُرسَل، ويُرفع
 * بحذف متغيّراته واحداً واحداً من الجدول: موديلٌ بستّة مقاسات يعني ستّ
 * ضغطات لرفع لونٍ واحد. وهنا اللون وحدةٌ واحدة والمقاسات تتبعه.
 *
 * والألوان المضافة مضيئةٌ بعلامة ✓، وغيرها باهتٌ ينتظر ضغطة. فيُقرأ من
 * الشاشة أيُّ الألوان لهذا الموديل — وهو نفسه ما يظهر في الفاتورة.
 */
export function ProductColors({
  productId,
  colors,
}: {
  productId: string;
  colors: ColorChoice[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});

  function toggle(c: ColorChoice) {
    setBusyId(c.id);
    setMessage({});
    startTransition(async () => {
      const res = await toggleProductColor(productId, c.id, c.variants === 0);
      setMessage({ ok: res.ok, error: res.error });
      setBusyId(null);
    });
  }

  if (colors.length === 0) {
    return (
      <p className="text-xs text-txt-4">
        لا ألوان معرَّفة بعد. أضِفها من شاشة «التصنيفات والقوائم».
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const on = c.variants > 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c)}
              disabled={pending}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                on
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line text-txt-3 hover:border-brand hover:text-brand'
              }`}
            >
              <span
                aria-hidden
                style={{ backgroundColor: c.hex ?? 'transparent' }}
                className="h-5 w-5 shrink-0 rounded-full border border-line-2"
              />
              <span>{c.nameAr}</span>
              {busyId === c.id ? (
                <span className="text-[0.65rem]">…</span>
              ) : on ? (
                <span className="text-[0.65rem]">✓ {c.variants}</span>
              ) : (
                <span className="text-[0.65rem] text-txt-4">+</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[0.7rem] leading-[1.9] text-txt-4">
        المضيء ✓ من ألوان هذا الموديل، والرقم عدد مقاساته. ضغطةٌ على الباهت تضيفه بكل
        مقاسات الموديل، وضغطةٌ على المضيء ترفعه — ولا يُرفع لونٌ في المخزن منه رصيد.
        وفي الفاتورة لا تظهر إلا ألوان الموديل المختار.
      </p>

      {message.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          {message.ok}
        </p>
      )}
      {message.error && (
        <p role="alert" className="rounded-lg border border-bad bg-bad-soft px-4 py-2.5 text-xs text-bad">
          {message.error}
        </p>
      )}
    </div>
  );
}
