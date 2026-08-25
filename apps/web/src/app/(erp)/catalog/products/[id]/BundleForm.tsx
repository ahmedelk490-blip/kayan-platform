'use client';

import { useActionState, useState } from 'react';
import { SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '../actions';

export interface BundleSize {
  id: string;
  code: string;
}

/**
 * تعريف سيريه/طقم: اسم + كمية لكل مقاس من مقاسات المنتج + تكلفة/سعر الدست.
 *
 * صفٌّ لكل مقاس بحقل كمية؛ المقاسات بكمية صفر تُهمَل. المجموع يظهر حيّاً حتى
 * يرى المدير عدد قطع الطقم قبل الحفظ (مثلاً «٨ قطع»)، وتكلفة/سعر القطعة
 * يُشتقّان بالقسمة على المجموع فور الكتابة.
 */
export function BundleForm({
  action,
  sizes,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  sizes: BundleSize[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [cost, setCost] = useState(0);
  const [price, setPrice] = useState(0);
  const total = Object.values(qty).reduce((s, n) => s + (n || 0), 0);

  if (sizes.length === 0) {
    return (
      <p className="text-[0.7rem] leading-[1.9] text-txt-4">
        أضِف مقاسات للمنتج أولاً (من «إضافة ألوان ومقاسات»)، ثم عرّف السيريه بتوزيعها.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4" key={state.ok /* تُفرَّغ الحقول بعد النجاح */}>
      <FormError message={state.error} />
      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-3 py-2 text-xs text-ok">
          {state.ok}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs text-txt-2">اسم السيريه</span>
        <input
          name="bundleName"
          placeholder="مثال: سيريه، درزن"
          className="erp-input py-2.5"
        />
        {state.fieldErrors?.bundleName && (
          <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.bundleName}</span>
        )}
      </label>

      <div>
        <span className="mb-2 block text-xs text-txt-2">كمية كل مقاس في الطقم الواحد</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sizes.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
              <span className="min-w-8 text-sm font-medium text-txt">{s.code}</span>
              <input
                name={`qty_${s.id}`}
                type="number"
                min="0"
                step="1"
                dir="ltr"
                defaultValue={0}
                onChange={(e) => setQty((p) => ({ ...p, [s.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                className="erp-input w-full py-1.5 text-start"
              />
            </label>
          ))}
        </div>
      </div>

      <BundlePricing
        total={total}
        cost={cost}
        price={price}
        onCost={setCost}
        onPrice={setPrice}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-txt-3">
          إجمالي القطع في السيريه: <span className="tnum font-semibold text-brand">{total}</span>
        </span>
        <SubmitButton label="حفظ السيريه" />
      </div>
    </form>
  );
}

/**
 * حقول تكلفة/سعر الدست، وتحتها تكلفة/سعر القطعة محسوبَين تلقائياً بالقسمة على
 * عدد قطع السيريه — نفس منطق نظام الدستة على مستوى المنتج، لكن للسيريه.
 */
export function BundlePricing({
  total,
  cost,
  price,
  onCost,
  onPrice,
}: {
  total: number;
  cost: number;
  price: number;
  onCost: (n: number) => void;
  onPrice: (n: number) => void;
}) {
  const per = Math.max(1, total);
  const pieceCost = cost / per;
  const piecePrice = price / per;
  return (
    <div className="rounded-lg border border-line bg-card-2 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">تكلفة الدست</span>
          <input
            name="bundleCost"
            type="number"
            min="0"
            step="0.01"
            dir="ltr"
            value={cost || ''}
            onChange={(e) => onCost(Math.max(0, Number(e.target.value) || 0))}
            className="erp-input py-2.5 text-start"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">سعر الدست</span>
          <input
            name="bundlePrice"
            type="number"
            min="0"
            step="0.01"
            dir="ltr"
            value={price || ''}
            onChange={(e) => onPrice(Math.max(0, Number(e.target.value) || 0))}
            className="erp-input py-2.5 text-start"
          />
        </label>
      </div>
      <p className="mt-2 text-[0.7rem] leading-[1.9] text-txt-4">
        تكلفة القطعة: <span className="tnum text-txt-2">{pieceCost ? pieceCost.toFixed(2) : '—'}</span>
        {' · '}سعر القطعة: <span className="tnum text-txt-2">{piecePrice ? piecePrice.toFixed(2) : '—'}</span>
        {' '}(بالقسمة على {per} قطعة)
      </p>
    </div>
  );
}
