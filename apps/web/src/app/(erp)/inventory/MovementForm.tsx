'use client';

import { useActionState, useState } from 'react';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import { SearchableSelect } from '@/components/crud/SearchableSelect';
import { useFormSuccess } from '@/components/crud/useFormSuccess';
import { compareSizes } from '@erp/domain';
import { postMovement, type FormState } from './actions';
import { MOVEMENT_OPTIONS } from './types';

export interface VariantChoice {
  value: string;
  label: string;
  /** قطع الدستة لمنتج هذا المتغيّر — لحساب الكمية من الدست. */
  perDozen: number;
  productId: string;
  productName: string;
  colorId: string | null;
  colorName: string | null;
  sizeId: string | null;
  sizeCode: string | null;
}

/** ألوان منتجٍ بعينه، بلا تكرار. */
function colorsOf(variants: VariantChoice[], productId: string) {
  const seen = new Map<string, string>();
  for (const v of variants)
    if (v.productId === productId && v.colorId && v.colorName && !seen.has(v.colorId))
      seen.set(v.colorId, v.colorName);
  return [...seen].map(([id, label]) => ({ id, label }));
}

/** مقاسات منتجٍ بلونٍ محدّد، من الأصغر للأكبر. */
function sizesOf(variants: VariantChoice[], productId: string, colorId: string) {
  const seen = new Map<string, string>();
  for (const v of variants)
    if (
      v.productId === productId &&
      (v.colorId ?? '') === colorId &&
      v.sizeId &&
      v.sizeCode &&
      !seen.has(v.sizeId)
    )
      seen.set(v.sizeId, v.sizeCode);
  return [...seen]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => compareSizes(a.label, b.label));
}

export function MovementForm({
  variants,
  onSuccess,
}: {
  variants: VariantChoice[];
  /** Supplied by the modal only. The full page leaves it undefined. */
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(postMovement, {});
  useFormSuccess(state.ok, onSuccess);

  // منتج ← لون ← مقاس، كفاتورة المبيعات.
  //
  // كان حقلاً واحداً يبحث في كل متغيّرات النظام مخلوطة: من يسجّل تيشيرتاً
  // يمرّ على ألوان اليلك والشماغ ومقاساتها. والمالك يفكّر بالموديل أوّلاً ثم
  // بلونه ثم بمقاسه — فهذا ترتيب السؤال لا ترتيب الجدول.
  const [productId, setProductId] = useState('');
  const [colorId, setColorId] = useState('');
  // كميةٌ لكل متغيّر — المقاسات تُملأ معاً لا واحداً بعد واحد.
  const [qtyByVariant, setQtyByVariant] = useState<Record<string, number>>({});

  const products = [...new Map(variants.map((v) => [v.productId, v.productName]))].map(
    ([id, label]) => ({ value: id, label }),
  );
  const colors = productId ? colorsOf(variants, productId) : [];
  const sizes = productId ? sizesOf(variants, productId, colorId) : [];

  /** متغيّر هذا المقاس (أو متغيّر اللون نفسه حين لا مقاسات له). */
  const variantFor = (sizeId: string) =>
    variants.find(
      (v) =>
        v.productId === productId &&
        (v.colorId ?? '') === colorId &&
        (v.sizeId ?? '') === sizeId,
    )?.value ?? '';

  // صفٌّ لكل مقاس، أو صفٌّ واحد للّون حين يكون بلا مقاسات.
  const rows =
    productId && (colors.length === 0 || colorId)
      ? sizes.length > 0
        ? sizes
            .map((z) => ({ variantId: variantFor(z.id), label: z.label }))
            .filter((r) => r.variantId)
            .map((r) => ({ ...r, qty: qtyByVariant[r.variantId] ?? 0 }))
        : (() => {
            const id = variantFor('');
            return id ? [{ variantId: id, label: 'الكمية', qty: qtyByVariant[id] ?? 0 }] : [];
          })()
      : [];

  const totalQty = rows.reduce((n, r) => n + r.qty, 0);

  const setQty = (id: string, qty: number) =>
    setQtyByVariant((prev) => ({ ...prev, [id]: qty }));

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.error} />
      {state.ok && !onSuccess && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-3 text-xs text-ok">
          {state.ok}
        </p>
      )}

      {/* المنتج ببحثٍ بالكتابة، ثم ألوانه ومقاساته وحدها. */}
      <label className="block">
        <span className="mb-1.5 block text-xs text-txt-2">المنتج</span>
        <SearchableSelect
          // اسمٌ لا يقرأه الخادم — المتغيّر المحسوب هو ما يُرسَل.
          name="productPick"
          options={products}
          placeholder="اكتب اسم الموديل…"
          onSelect={(id) => {
            setProductId(id);
            const cs = colorsOf(variants, id);
            setColorId(cs.length === 1 ? cs[0].id : '');
            // كمياتٌ كُتبت لموديلٍ آخر لا تُحمَل معه.
            setQtyByVariant({});
          }}
        />
      </label>

      {productId && colors.length > 0 && (
        <div className="block">
          <span className="mb-1.5 block text-xs text-txt-2">اللون</span>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setColorId(c.id);
                  setQtyByVariant({});
                }}
                className={`rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                  colorId === c.id
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line-2 text-txt-2 hover:border-brand'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* لا صفَّ اختيارٍ للمقاس: لكل مقاسٍ خانته أدناه، فالاختيار هو الكتابة.
          وصفٌّ يُختار ثم تُكتب كميةٌ واحدة كان يجعل إدخال ستّة مقاسات ستّ
          دوراتٍ كاملة على النافذة نفسها. */}

      {/* لونٌ بلا مقاسات ليس خطأً بالضرورة — لكنه غالباً موديلٌ أُضيفت ألوانه
          قبل مقاساته، فيقف صاحبه أمام خانة كميةٍ واحدة ولا يعرف لماذا اختفت
          المقاسات. يُقال له السبب والمكان بدل أن يخمّن. */}
      {productId && colorId && sizes.length === 0 && (
        <p className="rounded-lg border border-warn bg-warn-soft px-4 py-2.5 text-[0.7rem] leading-[1.9] text-warn">
          هذا اللون بلا مقاسات — الكمية أدناه تخصّ اللون كلّه. لإضافة مقاساته: صفحة
          المنتج ← «مقاسات هذا الموديل».
        </p>
      )}

      {/* خانةٌ لكل مقاس — الشحنة تصل بستّة مقاسات، فتُدخَل مرّةً واحدة.
          ما يبقى صفراً يعني «لم يصلني هذا المقاس» فلا يُسجَّل له شيء. */}
      <div className="rounded-xl border border-brand/25 bg-brand-soft/40 p-3">
        <div className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <label key={r.variantId} className="block w-24">
              <span className="mb-1 block text-center text-xs font-semibold text-txt-2">
                {r.label}
              </span>
              <input
                type="number"
                min="0"
                step="1"
                dir="ltr"
                value={r.qty || ''}
                placeholder="0"
                onChange={(e) =>
                  setQty(r.variantId, Math.max(0, Math.round(Number(e.target.value) || 0)))
                }
                className="erp-input py-2.5 text-center"
              />
              {/* المُرسَل للخادم: زوجٌ لكل مقاس بالترتيب نفسه. */}
              <input type="hidden" name="variantId" value={r.variantId} />
              <input type="hidden" name="quantity" value={r.qty} />
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand/15 pt-2">
          <span className="text-[0.7rem] text-txt-4">
            {rows.length === 0
              ? 'اختر المنتج واللون لتظهر المقاسات.'
              : `${rows.filter((r) => r.qty > 0).length} مقاس بكمية`}
          </span>
          <span className="text-sm">
            <span className="text-xs text-txt-3">الإجمالي </span>
            <span className="tnum font-bold text-brand">{totalQty}</span>
            <span className="text-xs text-txt-3"> قطعة</span>
          </span>
        </div>
        {state.fieldErrors?.variantId && (
          <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.variantId}</span>
        )}
        {state.fieldErrors?.quantity && (
          <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.quantity}</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          name="type"
          label="نوع الحركة"
          required
          options={MOVEMENT_OPTIONS}
          defaultValue="RECEIPT"
          errors={state.fieldErrors}
        />
        <Field name="reference" label="المرجع (اختياري)" errors={state.fieldErrors} />
      </div>

      <TextArea name="reason" label="السبب" rows={2} errors={state.fieldErrors} />
      <SubmitButton label="تسجيل الحركة" />
    </form>
  );
}
