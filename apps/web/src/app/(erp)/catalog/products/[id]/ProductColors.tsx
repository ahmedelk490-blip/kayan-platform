'use client';

import { useActionState, useState, useTransition } from 'react';
import { addColorToProduct, toggleProductColor } from '../actions';

export interface ColorChoice {
  id: string;
  nameAr: string;
  hex: string | null;
  /** عدد مقاسات هذا اللون في هذا المنتج. */
  variants: number;
}

interface State {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * ألوان هذا الموديل — وحدَها.
 *
 * كانت الألوان قائمةً عامّة واحدة تُعرَض كاملةً في كل منتج: من يضيف لون
 * تيشيرتٍ يمرّ على ألوان اليلك والشماغ ليجد لونه، ولا يعرف من الشاشة أيُّ
 * الألوان لهذا الموديل فعلاً. فهنا لا يُعرض إلا ما هو منه، ويُكتب الجديد
 * باسمه ولونه في مكانه — فيُربط بالموديل فور كتابته.
 *
 * والمقاسات تتبع اللون: إضافةٌ واحدة تُنشئه بكل مقاسات الموديل، ورفعةٌ
 * واحدة ترفعه بها. وهو نفسه ما يظهر في الفاتورة وأمر البيع.
 */
export function ProductColors({
  productId,
  colors,
}: {
  productId: string;
  colors: ColorChoice[];
}) {
  const [addState, addAction, adding] = useActionState<State, FormData>(
    addColorToProduct.bind(null, productId),
    {},
  );
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<State>({});

  function remove(c: ColorChoice) {
    // الرفع يشطب رصيده من المخزن — يُسأل قبله لا بعده.
    if (!window.confirm(`حذف اللون «${c.nameAr}» من الموديل؟\nرصيده في المخزن يُشطب، والفواتير والتقارير القديمة لا تتأثّر.`)) return;
    setBusyId(c.id);
    setRemoved({});
    startTransition(async () => {
      const res = await toggleProductColor(productId, c.id, false);
      setRemoved({ ok: res.ok, error: res.error });
      setBusyId(null);
    });
  }

  return (
    <div className="space-y-4">
      {colors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-card-2 px-4 py-4 text-center text-xs text-txt-3">
          لا ألوان لهذا الموديل بعد — اكتب أوّل لون أدناه.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-brand bg-brand-soft px-3 py-2 text-sm text-brand"
            >
              <span
                aria-hidden
                style={{ backgroundColor: c.hex ?? 'transparent' }}
                className="h-5 w-5 shrink-0 rounded-full border border-line-2"
              />
              <span>{c.nameAr}</span>
              <span className="tnum text-[0.65rem] opacity-75">{c.variants} مقاس</span>
              <button
                type="button"
                onClick={() => remove(c)}
                disabled={pending}
                aria-label={`ارفع ${c.nameAr}`}
                className="text-[0.8rem] text-bad transition-opacity hover:opacity-70 disabled:opacity-40"
              >
                {busyId === c.id ? '…' : '✕'}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* اللون الجديد يُكتب هنا لا في قائمةٍ عامّة — فيُربط بالموديل فور كتابته. */}
      <form action={addAction} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">لون جديد لهذا الموديل</span>
          <input
            name="nameAr"
            placeholder="مثال: كحلي"
            className="erp-input w-44 py-2.5"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">عيّنته</span>
          <input
            name="hex"
            type="color"
            defaultValue="#1f1418"
            className="h-[42px] w-14 cursor-pointer rounded-lg border border-line bg-card p-1"
          />
        </label>
        <button type="submit" disabled={adding} className="erp-btn disabled:opacity-50">
          {adding ? 'جارٍ الإضافة…' : '+ أضف اللون'}
        </button>
      </form>

      <p className="text-[0.7rem] leading-[1.9] text-txt-4">
        اللون يُضاف بكل مقاسات هذا الموديل دفعةً واحدة، و«✕» ترفعه بها — ولا يُرفع لونٌ
        في المخزن منه رصيد. وفي الفاتورة وأمر البيع لا تظهر إلا ألوان الموديل المختار.
      </p>

      {(addState.ok || removed.ok) && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          {addState.ok ?? removed.ok}
        </p>
      )}
      {(addState.error || addState.fieldErrors?.nameAr || removed.error) && (
        <p role="alert" className="rounded-lg border border-bad bg-bad-soft px-4 py-2.5 text-xs text-bad">
          {addState.error ?? addState.fieldErrors?.nameAr ?? removed.error}
        </p>
      )}
    </div>
  );
}
