'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useActionState } from 'react';
import { formatMoney, PAYMENT_METHODS, PAYMENT_METHOD_AR, dec } from '@erp/domain';
import { FormError } from '@/components/crud/Form';
import type { VariantOption } from '@/app/(erp)/sales/DocumentForm';
import type { FormState } from '@/app/(erp)/invoices/shared';
import { cashierCheckout } from './actions';

interface CartLine {
  key: string;
  variantId: string;
  label: string;
  quantity: number;
  unitPrice: number;
}

interface Choice { id: string; label: string }

/** لوحة الكاشير: كروت منتجات بالصور، اختيار سريع، وفاتورة تُصدَر وتُحصَّل بضغطة. */
export function CashierBoard({
  customers,
  variants,
  images,
  warehouseId,
}: {
  customers: { value: string; label: string }[];
  variants: VariantOption[];
  images: Record<string, string | null>;
  warehouseId: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(cashierCheckout, {});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<string | null>(null); // productId being configured
  const [customerId, setCustomerId] = useState('');
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState('CASH');

  // المنتجات المميّزة من المتغيّرات، بصورها.
  const products = useMemo(() => {
    const map = new Map<string, { id: string; name: string; image: string | null }>();
    for (const v of variants) if (!map.has(v.productId)) map.set(v.productId, { id: v.productId, name: v.productName, image: images[v.productId] ?? null });
    return [...map.values()];
  }, [variants, images]);

  const total = cart.reduce((s, l) => s.plus(dec(l.quantity).times(dec(l.unitPrice))), dec(0));
  const remaining = total.minus(paid);

  function addLine(l: CartLine) {
    setCart((prev) => {
      const found = prev.find((x) => x.variantId === l.variantId);
      if (found) return prev.map((x) => (x.variantId === l.variantId ? { ...x, quantity: x.quantity + l.quantity } : x));
      return [...prev, l];
    });
    setPicking(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      {/* شبكة المنتجات بالصور */}
      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPicking(p.id)}
              className="group overflow-hidden rounded-2xl border border-line bg-card-2 text-start transition-colors hover:border-brand"
            >
              <div className="relative aspect-square bg-card">
                {p.image ? (
                  <Image src={p.image} alt={p.name} fill sizes="200px" className="object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-txt-4">لا صورة</div>
                )}
              </div>
              <p className="truncate px-3 py-2.5 text-sm font-medium text-txt">{p.name}</p>
            </button>
          ))}
        </div>
        {products.length === 0 && <p className="py-10 text-center text-sm text-txt-3">لا منتجات نشطة.</p>}
      </div>

      {/* الفاتورة */}
      <form action={formAction} className="erp-card flex h-fit flex-col gap-4 p-5 lg:sticky lg:top-6">
        <FormError message={state.error} />
        <input type="hidden" name="warehouseId" value={warehouseId} />
        {cart.map((l) => (
          <span key={l.key} className="hidden">
            <input type="hidden" name="lineVariantId" value={l.variantId} />
            <input type="hidden" name="lineQuantity" value={l.quantity} />
            <input type="hidden" name="lineUnitPrice" value={l.unitPrice} />
          </span>
        ))}

        <h3 className="text-sm font-semibold text-brand">الفاتورة ({cart.length})</h3>

        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="py-6 text-center text-xs text-txt-4">اضغط منتجاً لإضافته.</p>
          ) : (
            cart.map((l) => (
              <div key={l.key} className="rounded-lg border border-line bg-card-2 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-txt">{l.label}</span>
                  <button type="button" onClick={() => setCart((p) => p.filter((x) => x.key !== l.key))} className="text-[0.7rem] text-bad hover:underline">حذف</button>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center rounded-lg border border-line-2">
                    <button type="button" onClick={() => setCart((p) => p.map((x) => x.key === l.key ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))} className="px-2 py-0.5 text-txt-3">−</button>
                    <span className="tnum min-w-7 text-center text-xs text-txt">{l.quantity}</span>
                    <button type="button" onClick={() => setCart((p) => p.map((x) => x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x))} className="px-2 py-0.5 text-txt-3">+</button>
                  </div>
                  <input
                    type="number" value={l.unitPrice} dir="ltr"
                    onChange={(e) => setCart((p) => p.map((x) => x.key === l.key ? { ...x, unitPrice: Math.max(0, Number(e.target.value) || 0) } : x))}
                    className="erp-input w-24 py-1 text-start text-xs"
                  />
                  <span className="tnum text-xs font-medium text-brand">{formatMoney(dec(l.quantity).times(dec(l.unitPrice)))}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-[0.7rem] text-txt-3">العميل</span>
          <select name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="erp-input py-2">
            <option value="">اختر العميل…</option>
            {customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-txt-2">الإجمالي</span>
          <span className="tnum text-xl font-bold text-brand">{formatMoney(total)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[0.7rem] text-txt-3">المدفوع</span>
            <input name="paymentAmount" type="number" value={paid} dir="ltr" onChange={(e) => setPaid(Math.max(0, Number(e.target.value) || 0))} className="erp-input py-2 text-start" />
            <button type="button" onClick={() => setPaid(total.toNumber())} className="mt-0.5 text-[0.7rem] text-brand hover:underline">المبلغ كامل</button>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.7rem] text-txt-3">طريقة السداد</span>
            <select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)} className="erp-input py-2">
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_AR[m]}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[0.7rem] text-txt-4">المتبقّي: <span className={`tnum font-semibold ${remaining.lte(0) ? 'text-ok' : 'text-warn'}`}>{formatMoney(remaining)}</span></p>

        <button type="submit" disabled={cart.length === 0 || !customerId} className="erp-btn py-3.5 text-base disabled:opacity-40">
          بيع وتحصيل
        </button>
      </form>

      {picking && (
        <VariantPicker
          product={products.find((p) => p.id === picking)!}
          variants={variants.filter((v) => v.productId === picking)}
          onClose={() => setPicking(null)}
          onAdd={addLine}
        />
      )}
    </div>
  );
}

/** نافذة اختيار اللون والمقاس والكمية لمنتج، مع حساب السعر من الشرائح. */
function VariantPicker({
  product,
  variants,
  onClose,
  onAdd,
}: {
  product: { id: string; name: string };
  variants: VariantOption[];
  onClose: () => void;
  onAdd: (l: CartLine) => void;
}) {
  const colors: Choice[] = dedupe(variants.filter((v) => v.colorId).map((v) => ({ id: v.colorId!, label: v.colorName! })));
  const [color, setColor] = useState(colors.length === 1 ? colors[0].id : '');
  const sizes: Choice[] = dedupe(
    variants.filter((v) => (v.colorId ?? '') === color && v.sizeId).map((v) => ({ id: v.sizeId!, label: v.sizeCode! })),
  );
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(1);

  const variant = variants.find((v) => (v.colorId ?? '') === color && (v.sizeId ?? '') === size) ?? (colors.length === 0 && sizes.length === 0 ? variants[0] : undefined);
  const ready = !!variant && (colors.length === 0 || !!color) && (sizes.length === 0 || !!size);

  const unitPrice = variant ? priceFor(variant, qty) : 0;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog">
      <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-txt">{product.name}</h3>
          <button type="button" onClick={onClose} className="text-txt-3">✕</button>
        </div>

        {colors.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs text-txt-3">اللون</p>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button key={c.id} type="button" onClick={() => { setColor(c.id); setSize(''); }} className={`rounded-lg border px-3 py-1.5 text-xs ${color === c.id ? 'border-brand bg-brand text-white' : 'border-line-2 text-txt-2'}`}>{c.label}</button>
              ))}
            </div>
          </div>
        )}
        {sizes.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs text-txt-3">المقاس</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <button key={s.id} type="button" onClick={() => setSize(s.id)} className={`rounded-lg border px-3 py-1.5 text-xs ${size === s.id ? 'border-brand bg-brand text-white' : 'border-line-2 text-txt-2'}`}>{s.label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 flex items-end justify-between gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-txt-3">الكمية</span>
            <div className="flex items-center rounded-lg border border-line-2">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 text-txt-3">−</button>
              <span className="tnum min-w-8 text-center text-sm text-txt">{qty}</span>
              <button type="button" onClick={() => setQty((q) => q + 1)} className="px-3 py-2 text-txt-3">+</button>
            </div>
          </label>
          <div className="text-end">
            <p className="text-[0.7rem] text-txt-3">السعر</p>
            <p className="tnum text-lg font-bold text-brand">{ready ? formatMoney(unitPrice) : '—'}</p>
          </div>
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => variant && onAdd({
            key: variant.value + Date.now(),
            variantId: variant.value,
            label: variant.label,
            quantity: qty,
            unitPrice,
          })}
          className="erp-btn w-full py-3 disabled:opacity-40"
        >
          أضف للفاتورة
        </button>
      </div>
    </div>
  );
}

function dedupe(items: Choice[]): Choice[] {
  const seen = new Map<string, string>();
  for (const i of items) if (!seen.has(i.id)) seen.set(i.id, i.label);
  return [...seen].map(([id, label]) => ({ id, label }));
}

/** سعر الوحدة من شرائح المتغيّر للكمية (أقلّ سعر منطبق)، وإلا سعره الثابت. */
function priceFor(v: VariantOption, qty: number): number {
  const applicable = v.tiers.filter(
    (t) => (t.variantId === null || t.variantId === v.value) && t.minQty <= qty && (t.maxQty === null || qty <= t.maxQty),
  );
  if (applicable.length > 0) return Math.min(...applicable.map((t) => t.price));
  return v.price > 0 ? v.price : 0;
}
