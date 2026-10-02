'use client';

import { useState, useTransition } from 'react';
import { toggleProductSize } from '../actions';

export interface SizeChoice {
  id: string;
  code: string;
  /** عدد ألوان هذا الموديل التي تحمل المقاس — صفر يعني أنه ليس من مقاساته. */
  variants: number;
}

/**
 * مقاسات هذا الموديل — ضغطةٌ تضيف وضغطةٌ ترفع.
 *
 * كانت المقاسات تُدار من نموذج «لون×مقاس» وحده، فمن أضاف ألواناً لموديلٍ لا
 * مقاسات له بعد وجد ألوانه بلا مقاس: في تسجيل حركة المخزون يختار اللون ولا
 * ينفتح له صفُّ مقاسات، وكذلك في الفاتورة. فالمقاس هنا وحدةٌ كاللون، والضغطة
 * الواحدة تنشره على ألوان الموديل كلّها.
 *
 * وعلى خلاف الألوان تُعرَض مقاسات النظام كلّها لا مقاسات الموديل وحدها:
 * سُلَّم المقاسات قصيرٌ ومعروف (L … 5XL) ولا يطول بطول الكتالوج، والمالك
 * يحتاج أن يرى ما لم يُضفه بعد ليضيفه.
 */
export function ProductSizes({
  productId,
  sizes,
}: {
  productId: string;
  sizes: SizeChoice[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});

  function toggle(z: SizeChoice) {
    // الرفع يشطب رصيده من المخزن — يُسأل قبله لا بعده.
    if (z.variants > 0 && !window.confirm(`حذف المقاس «${z.code}» من الموديل؟\nرصيده في المخزن يُشطب، والفواتير والتقارير القديمة لا تتأثّر.`)) return;
    setBusyId(z.id);
    setMessage({});
    startTransition(async () => {
      const res = await toggleProductSize(productId, z.id, z.variants === 0);
      setMessage({ ok: res.ok, error: res.error });
      setBusyId(null);
    });
  }

  if (sizes.length === 0) {
    return (
      <p className="text-xs text-txt-4">
        لا مقاسات معرَّفة بعد. أضِفها من شاشة «التصنيفات والقوائم».
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {sizes.map((z) => {
          const on = z.variants > 0;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => toggle(z)}
              disabled={pending}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                on
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line text-txt-3 hover:border-brand hover:text-brand'
              }`}
            >
              <span className="font-medium">{z.code}</span>
              {busyId === z.id ? (
                <span className="text-[0.65rem]">…</span>
              ) : on ? (
                <span className="text-[0.65rem]">✓ {z.variants}</span>
              ) : (
                <span className="text-[0.65rem] text-txt-4">+</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[0.7rem] leading-[1.9] text-txt-4">
        المضيء ✓ من مقاسات هذا الموديل، والرقم عدد ألوانه التي تحمله. ضغطةٌ على الباهت
        تضيفه لكل ألوان الموديل، وضغطةٌ على المضيء ترفعه — ولا يُرفع مقاسٌ في المخزن منه
        رصيد. وبعدها يظهر المقاس في الفاتورة وفي تسجيل حركة المخزون.
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
