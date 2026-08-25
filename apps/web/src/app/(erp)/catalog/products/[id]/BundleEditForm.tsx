'use client';

import { useActionState, useState } from 'react';
import { SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '../actions';
import { BundlePricing, type BundleSize } from './BundleForm';

/**
 * تعديل سيريه قائمة من داخل صفحة المنتج: الاسم، تكلفة/سعر الدست، وكمية كل
 * مقاس — كلّها قابلة للتغيير مباشرة. القيم مُهيّأة بما هو محفوظ، والمجموع
 * وتكلفة/سعر القطعة يتحدّثان حيّاً. زر الحذف مستقل بجواره.
 */
export function BundleEditForm({
  action,
  remove,
  sizes,
  initial,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  remove: () => Promise<void>;
  sizes: BundleSize[];
  initial: { nameAr: string; cost: number; price: number; quantities: Record<string, number> };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [qty, setQty] = useState<Record<string, number>>(initial.quantities);
  const [cost, setCost] = useState(initial.cost);
  const [price, setPrice] = useState(initial.price);
  const total = Object.values(qty).reduce((s, n) => s + (n || 0), 0);

  return (
    <li className="rounded-lg border border-line bg-card-2 p-4">
      <form action={formAction} className="space-y-4">
        <FormError message={state.error} />
        {state.ok && (
          <p role="status" className="rounded-lg border border-ok bg-ok-soft px-3 py-2 text-xs text-ok">
            {state.ok}
          </p>
        )}

        <div className="flex items-end justify-between gap-3">
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs text-txt-2">اسم السيريه</span>
            <input
              name="bundleName"
              defaultValue={initial.nameAr}
              className="erp-input py-2.5"
            />
            {state.fieldErrors?.bundleName && (
              <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.bundleName}</span>
            )}
          </label>
          <span className="pb-2.5 text-[0.7rem] text-txt-3">
            <span className="tnum font-semibold text-brand">{total}</span> قطعة
          </span>
        </div>

        <div>
          <span className="mb-2 block text-xs text-txt-2">كمية كل مقاس</span>
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
                  defaultValue={initial.quantities[s.id] ?? 0}
                  onChange={(e) => setQty((p) => ({ ...p, [s.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                  className="erp-input w-full py-1.5 text-start"
                />
              </label>
            ))}
          </div>
        </div>

        <BundlePricing total={total} cost={cost} price={price} onCost={setCost} onPrice={setPrice} />

        <div className="flex items-center gap-3">
          <SubmitButton label="حفظ التعديل" />
        </div>
      </form>

      <form action={remove} className="mt-2 border-t border-line pt-2">
        <button type="submit" className="text-[0.7rem] text-bad hover:underline">حذف السيريه</button>
      </form>
    </li>
  );
}
