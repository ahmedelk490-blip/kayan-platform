'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatMoney, PAYMENT_METHODS, PAYMENT_METHOD_AR, PRICE_SERVICE_AR, dec } from '@erp/domain';
import { FormError } from '@/components/crud/Form';
import { SearchableSelect } from '@/components/crud/SearchableSelect';
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

  // عميل سريع: اسم + موبايل مكان القائمة — للأوردر السريع على الكاونتر.
  const [quickCustomer, setQuickCustomer] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const customerReady = quickCustomer
    ? quickName.trim().length > 0 && quickPhone.trim().length > 0
    : Boolean(customerId);

  // المنتجات المميّزة من المتغيّرات، بصورها.
  const products = useMemo(() => {
    const map = new Map<string, { id: string; name: string; image: string | null }>();
    for (const v of variants) if (!map.has(v.productId)) map.set(v.productId, { id: v.productId, name: v.productName, image: images[v.productId] ?? null });
    return [...map.values()];
  }, [variants, images]);

  const total = cart.reduce((s, l) => s.plus(dec(l.quantity).times(dec(l.unitPrice))), dec(0));
  const remaining = total.minus(paid);

  // إضافة عدة سطور دفعة واحدة (كمية لكل مقاس)، مع دمج المتكرّر بالمتغيّر.
  function addLines(newLines: CartLine[]) {
    setCart((prev) => {
      let next = [...prev];
      for (const l of newLines) {
        const found = next.find((x) => x.variantId === l.variantId);
        if (found) next = next.map((x) => (x.variantId === l.variantId ? { ...x, quantity: x.quantity + l.quantity } : x));
        else next = [...next, l];
      }
      return next;
    });
    setPicking(null);
  }

  return (
    // pb-24 على الجوال: خلوص للشريط السفلي الثابت كي لا يغطي زر «بيع وتحصيل».
    <div className="grid gap-6 pb-24 lg:grid-cols-[1.6fr_1fr] lg:pb-0">
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
      <form id="cashier-cart" action={formAction} className="erp-card flex h-fit scroll-mt-24 flex-col gap-4 p-5 lg:sticky lg:top-6">
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
                {/* أزرار لمس كبيرة (≥40px) — الكاشير غالباً على جوال أو شاشة لمس. */}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center overflow-hidden rounded-lg border border-line-2">
                    <button type="button" aria-label="أنقص" onClick={() => setCart((p) => p.map((x) => x.key === l.key ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))} className="grid h-10 w-10 place-items-center text-lg text-txt-2 active:bg-card">−</button>
                    <span className="tnum min-w-8 text-center text-sm font-medium text-txt">{l.quantity}</span>
                    <button type="button" aria-label="زد" onClick={() => setCart((p) => p.map((x) => x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x))} className="grid h-10 w-10 place-items-center text-lg text-txt-2 active:bg-card">+</button>
                  </div>
                  <input
                    type="number" value={l.unitPrice} dir="ltr"
                    onChange={(e) => setCart((p) => p.map((x) => x.key === l.key ? { ...x, unitPrice: Math.max(0, Number(e.target.value) || 0) } : x))}
                    className="erp-input w-24 py-2 text-start text-xs"
                  />
                  <span className="tnum text-xs font-medium text-brand">{formatMoney(dec(l.quantity).times(dec(l.unitPrice)))}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="block">
          <span className="mb-1 flex items-center justify-between text-[0.7rem] text-txt-3">
            <span>العميل</span>
            <button
              type="button"
              onClick={() => setQuickCustomer((v) => !v)}
              className="font-medium text-brand hover:underline"
            >
              {quickCustomer ? '← عميل موجود' : '+ عميل جديد بسرعة'}
            </button>
          </span>
          {quickCustomer ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                name="newCustomerName"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="اسم العميل"
                className="erp-input py-2.5"
              />
              <input
                name="newCustomerPhone"
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
                dir="ltr"
                inputMode="tel"
                placeholder="رقم الموبايل"
                className="erp-input py-2.5 text-start"
              />
            </div>
          ) : (
            <SearchableSelect
              name="customerId"
              options={customers}
              placeholder="ابحث عن العميل أو اختره…"
              required
              onSelect={setCustomerId}
            />
          )}
          {state.fieldErrors?.customerId && (
            <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.customerId}</span>
          )}
        </div>

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

        <CheckoutButton disabled={cart.length === 0 || !customerReady} />
      </form>

      {picking && (
        <VariantPicker
          product={products.find((p) => p.id === picking)!}
          variants={variants.filter((v) => v.productId === picking)}
          onClose={() => setPicking(null)}
          onAdd={addLines}
        />
      )}

      {/* شريط سفلي ثابت للجوال: الإجمالي دائماً أمام العين، وضغطة تنزل
          للفاتورة — بدل التمرير الطويل تحت شبكة المنتجات. */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-line bg-card px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.12)] lg:hidden">
          <div>
            <p className="text-[0.65rem] text-txt-4">
              {cart.reduce((s, l) => s + l.quantity, 0)} قطعة · {cart.length} صنف
            </p>
            <p className="tnum text-lg font-bold text-brand">{formatMoney(total)}</p>
          </div>
          <a href="#cashier-cart" className="erp-btn px-6 py-3">
            إتمام البيع ↓
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * نافذة اختيار المنتج: لون واحد، ثم **كمية لكل مقاس** — فالزبون الذي يريد
 * قطعتين L وقطعتين XL وواحدة 2XL يُدخلها دفعة واحدة، وتُضاف سطوراً منفصلة
 * بأسعارها. المنتج بلا مقاسات يُدخَل بكمية واحدة.
 */
function VariantPicker({
  product,
  variants,
  onClose,
  onAdd,
}: {
  product: { id: string; name: string };
  variants: VariantOption[];
  onClose: () => void;
  onAdd: (lines: CartLine[]) => void;
}) {
  const colors: Choice[] = dedupe(variants.filter((v) => v.colorId).map((v) => ({ id: v.colorId!, label: v.colorName! })));
  const [color, setColor] = useState(colors.length === 1 ? colors[0].id : colors.length === 0 ? '__none' : '');
  const colorChosen = color !== '';

  const sizes: Choice[] = dedupe(
    variants.filter((v) => (v.colorId ?? '') === (color === '__none' ? '' : color) && v.sizeId).map((v) => ({ id: v.sizeId!, label: v.sizeCode! })),
  );
  // الخدمة (طباعة/تطريز…) — تحدّد الشريحة والسعر.
  const services = servicesOf(variants);
  const [service, setService] = useState(services[0] ?? '');

  // كمية لكل مقاس (أو للمتغيّر الأساسي حين لا مقاسات، بمفتاح ثابت).
  const [qtyBySize, setQtyBySize] = useState<Record<string, number>>({});
  const setQ = (key: string, n: number) => setQtyBySize((p) => ({ ...p, [key]: Math.max(0, n) }));

  const variantFor = (sizeId: string | null) =>
    variants.find((v) => (v.colorId ?? '') === (color === '__none' ? '' : color) && (v.sizeId ?? '') === (sizeId ?? ''));

  // بناء السطور من الكميات — لكل مقاس متغيّره وسعره حسب كميته.
  const rows = (sizes.length > 0 ? sizes.map((s) => ({ key: s.id, label: s.label, variant: variantFor(s.id) }))
    : [{ key: '__base', label: 'الكمية', variant: colorChosen ? variantFor(null) : undefined }]);

  const lines: CartLine[] = rows.flatMap((r) => {
    const q = qtyBySize[r.key] || 0;
    if (q <= 0 || !r.variant) return [];
    const svcLabel = service ? (PRICE_SERVICE_AR as Record<string, string>)[service] ?? '' : '';
    const label = svcLabel && svcLabel !== 'بدون' ? `${r.variant.label} · ${svcLabel}` : r.variant.label;
    return [{ key: `${r.variant.value}:${r.key}:${Date.now()}`, variantId: r.variant.value, label, quantity: q, unitPrice: priceFor(r.variant, q, service) }];
  });
  const totalPieces = lines.reduce((s, l) => s + l.quantity, 0);
  const totalPrice = lines.reduce((s, l) => s.plus(dec(l.quantity).times(dec(l.unitPrice))), dec(0));

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog">
      <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-txt">{product.name}</h3>
          <button type="button" onClick={onClose} className="text-txt-3">✕</button>
        </div>

        {colors.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs text-txt-3">اللون</p>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button key={c.id} type="button" onClick={() => { setColor(c.id); setQtyBySize({}); }} className={`rounded-lg border px-3 py-1.5 text-xs ${color === c.id ? 'border-brand bg-brand text-white' : 'border-line-2 text-txt-2'}`}>{c.label}</button>
              ))}
            </div>
          </div>
        )}

        {services.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs text-txt-3">الخدمة</p>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <button key={s} type="button" onClick={() => setService(s)} className={`rounded-lg border px-3 py-1.5 text-xs ${service === s ? 'border-brand bg-brand text-white' : 'border-line-2 text-txt-2'}`}>
                  {(PRICE_SERVICE_AR as Record<string, string>)[s] ?? s}
                </button>
              ))}
            </div>
          </div>
        )}

        {colorChosen ? (
          <div className="mb-4">
            <p className="mb-2 text-xs text-txt-3">{sizes.length > 0 ? 'الكمية لكل مقاس' : 'الكمية'}</p>
            <div className="space-y-2">
              {rows.map((r) => {
                const q = qtyBySize[r.key] || 0;
                return (
                  <div key={r.key} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-card-2 px-3 py-2">
                    <span className="min-w-10 text-sm font-medium text-txt">{r.label}</span>
                    {r.variant ? (
                      <div className="flex items-center gap-3">
                        <span className="tnum text-[0.7rem] text-txt-4">{formatMoney(priceFor(r.variant, q || 1, service))}</span>
                        <div className="flex items-center overflow-hidden rounded-lg border border-line-2">
                          <button type="button" aria-label="أنقص" onClick={() => setQ(r.key, q - 1)} className="grid h-11 w-11 place-items-center text-xl text-txt-2 active:bg-card">−</button>
                          <span className="tnum min-w-9 text-center text-base font-medium text-txt">{q}</span>
                          <button type="button" aria-label="زد" onClick={() => setQ(r.key, q + 1)} className="grid h-11 w-11 place-items-center text-xl text-txt-2 active:bg-card">+</button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[0.7rem] text-txt-4">غير متوفّر</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mb-4 text-xs text-txt-4">اختر اللون لإظهار المقاسات.</p>
        )}

        <div className="mb-3 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-txt-2">الإجمالي — <span className="tnum">{totalPieces}</span> قطعة</span>
          <span className="tnum font-bold text-brand">{formatMoney(totalPrice)}</span>
        </div>

        <button
          type="button"
          disabled={lines.length === 0}
          onClick={() => onAdd(lines)}
          className="erp-btn w-full py-3 disabled:opacity-40"
        >
          أضف للفاتورة
        </button>
      </div>
    </div>
  );
}

/** زر الإتمام: يتعطّل أثناء الإرسال — لمستان سريعتان لا تصنعان فاتورتين. */
function CheckoutButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="erp-btn py-3.5 text-base disabled:opacity-40"
    >
      {pending ? 'جارٍ إتمام البيع…' : 'بيع وتحصيل'}
    </button>
  );
}

function dedupe(items: Choice[]): Choice[] {
  const seen = new Map<string, string>();
  for (const i of items) if (!seen.has(i.id)) seen.set(i.id, i.label);
  return [...seen].map(([id, label]) => ({ id, label }));
}

/**
 * سعر الوحدة من شرائح المتغيّر للكمية والخدمة المختارة (وإلا أقلّ سعر منطبق،
 * وإلا سعره الثابت). تمرير الخدمة يجعل السعر يتبع «طباعة/تطريز…».
 */
function priceFor(v: VariantOption, qty: number, service?: string): number {
  const applicable = v.tiers.filter(
    (t) =>
      (t.variantId === null || t.variantId === v.value) &&
      (!service || t.service === service) &&
      t.minQty <= qty &&
      (t.maxQty === null || qty <= t.maxQty),
  );
  if (applicable.length > 0) return Math.min(...applicable.map((t) => t.price));
  return v.price > 0 ? v.price : 0;
}

/** خدمات المتغيّرات المتاحة (من الشرائح) بلا تكرار. */
function servicesOf(variants: VariantOption[]): string[] {
  const seen: string[] = [];
  for (const v of variants) for (const t of v.tiers) if (!seen.includes(t.service)) seen.push(t.service);
  return seen;
}
