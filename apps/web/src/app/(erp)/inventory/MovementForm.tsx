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
  const [sizeId, setSizeId] = useState('');
  const [dozens, setDozens] = useState(0);
  const [pieces, setPieces] = useState(0);

  const products = [...new Map(variants.map((v) => [v.productId, v.productName]))].map(
    ([id, label]) => ({ value: id, label }),
  );
  const colors = productId ? colorsOf(variants, productId) : [];
  const sizes = productId ? sizesOf(variants, productId, colorId) : [];

  // المتغيّر المطابق للاختيار — أو فارغ حتى يكتمل.
  const variantId =
    variants.find(
      (v) =>
        v.productId === productId &&
        (v.colorId ?? '') === colorId &&
        (v.sizeId ?? '') === sizeId,
    )?.value ?? '';

  const perDozen = variants.find((v) => v.value === variantId)?.perDozen ?? 12;
  const totalQty = dozens * perDozen + pieces;

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
            setSizeId('');
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
                  setSizeId('');
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

      {productId && (colors.length === 0 || colorId) && sizes.length > 0 && (
        <div className="block">
          <span className="mb-1.5 block text-xs text-txt-2">المقاس</span>
          <div className="flex flex-wrap gap-2">
            {sizes.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setSizeId(z.id)}
                className={`rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                  sizeId === z.id
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line-2 text-txt-2 hover:border-brand'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* لونٌ بلا مقاسات ليس خطأً بالضرورة — لكنه غالباً موديلٌ أُضيفت ألوانه
          قبل مقاساته، فيقف صاحبه أمام خانة كميةٍ واحدة ولا يعرف لماذا اختفت
          المقاسات. يُقال له السبب والمكان بدل أن يخمّن. */}
      {productId && colorId && sizes.length === 0 && (
        <p className="rounded-lg border border-warn bg-warn-soft px-4 py-2.5 text-[0.7rem] leading-[1.9] text-warn">
          هذا اللون بلا مقاسات — الكمية أدناه تخصّ اللون كلّه. لإضافة مقاساته: صفحة
          المنتج ← «مقاسات هذا الموديل».
        </p>
      )}

      {/* ما يصل الخادم كما كان تماماً — العرض هو ما تغيّر لا ما يُرسَل. */}
      <input type="hidden" name="variantId" value={variantId} />
      {state.fieldErrors?.variantId && (
        <span className="block text-[0.7rem] text-bad">{state.fieldErrors.variantId}</span>
      )}

      {/* الكمية بالدست + قطعة زيادة — تُحسب إلى إجمالي قطع. */}
      <div className="rounded-xl border border-brand/25 bg-brand-soft/40 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-txt-2">دست</span>
            <input type="number" min="0" step="1" dir="ltr" value={dozens}
              onChange={(e) => setDozens(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="erp-input py-2.5 text-start" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-txt-2">قطعة زيادة</span>
            <input type="number" min="0" step="1" dir="ltr" value={pieces}
              onChange={(e) => setPieces(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="erp-input py-2.5 text-start" />
          </label>
          <div className="block">
            <span className="mb-1.5 block text-xs text-txt-2">الإجمالي (قطعة)</span>
            <div className="tnum rounded-lg border border-line bg-card px-3 py-2.5 text-sm font-bold text-brand">{totalQty}</div>
          </div>
        </div>
        <p className="mt-2 text-[0.7rem] text-txt-4">
          {variantId ? `الدستة = ${perDozen} قطعة لهذا المنتج.` : 'اختر المتغيّر لمعرفة قطع الدستة.'} للإدخال بالقطعة فقط اترك «دست» صفراً.
        </p>
        {/* الكمية المُرسَلة للخادم — الإجمالي المحسوب. */}
        <input type="hidden" name="quantity" value={totalQty} />
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
