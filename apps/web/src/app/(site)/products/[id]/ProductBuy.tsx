'use client';

import { useMemo, useState } from 'react';
import { addToCart, itemKey, openCart } from '@/lib/cart';

interface Tier {
  service: string;
  minQty: number;
  maxQty: number | null;
  price: number;
  currency: string;
  color: string | null;
}

const SERVICE_AR: Record<string, string> = {
  EMBROIDERY: 'تطريز',
  DTF: 'طباعة DTF',
  PRINT: 'طباعة',
  SCREEN: 'طباعة سلك',
};

/**
 * اختيار المنتج وإضافته للسلّة.
 *
 * ألوان المنتج ومقاساته قابلة للنقر (لا عرض فقط). عند اكتمال الاختيار يظهر
 * السعر التقريبي المحسوب من شرائح السعر (حسب الكمية واللون). «أضف للسلّة»
 * يجمّع، و«اشترِ الآن» يفتح السلّة مباشرة لإتمام الطلب.
 */
export function ProductBuy({
  productId,
  productName,
  image,
  colors,
  sizes,
  tiers,
}: {
  productId: string;
  productName: string;
  image: string | null;
  colors: { nameAr: string; hex: string | null }[];
  sizes: string[];
  tiers: Tier[];
}) {
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(12);
  const [added, setAdded] = useState(false);

  const needsColor = colors.length > 0;
  const needsSize = sizes.length > 0;
  const ready = (!needsColor || !!color) && (!needsSize || !!size) && qty >= 1;

  // أسعار الشرائح المنطبقة على الكمية واللون المختارين، مجمّعة حسب الخدمة.
  const priceLines = useMemo(() => {
    const applicable = tiers.filter(
      (t) => (t.color === null || t.color === color) && t.minQty <= qty && (t.maxQty === null || qty <= t.maxQty),
    );
    const byService = new Map<string, Tier>();
    for (const t of applicable) {
      const cur = byService.get(t.service);
      // فضّل السعر الخاص باللون على العام، وإلا الأقل.
      if (!cur || (t.color !== null && cur.color === null) || t.price < cur.price) byService.set(t.service, t);
    }
    return [...byService.values()];
  }, [tiers, color, qty]);

  const priceText =
    priceLines.length > 0
      ? priceLines.map((t) => `${SERVICE_AR[t.service] ?? t.service} ${Number(t.price).toLocaleString('en-US')} ${t.currency}`).join(' · ')
      : '';

  function add(openAfter: boolean) {
    if (!ready) return;
    addToCart({
      key: itemKey(productId, color || undefined, size || undefined),
      productId,
      productName,
      image,
      colorLabel: color || undefined,
      sizeLabel: size || undefined,
      quantity: qty,
      priceText: priceText || undefined,
    });
    if (openAfter) openCart();
    else {
      setAdded(true);
      setTimeout(() => setAdded(false), 2200);
    }
  }

  return (
    <div className="mt-9">
      {/* الألوان — قابلة للاختيار */}
      {needsColor && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-body">
            اللون
            {color && <span className="ms-2 text-sm font-normal text-brand">{color}</span>}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {colors.map((c) => {
              const on = color === c.nameAr;
              return (
                <li key={c.nameAr}>
                  <button
                    type="button"
                    onClick={() => setColor(on ? '' : c.nameAr)}
                    aria-pressed={on}
                    title={c.nameAr}
                    className={`flex flex-col items-center gap-1.5 rounded-xl p-1 transition-transform ${on ? 'scale-105' : ''}`}
                  >
                    <span
                      className={`h-11 w-11 rounded-full border shadow-[inset_0_2px_6px_rgba(0,0,0,0.15)] ${on ? 'ring-2 ring-brand ring-offset-2 ring-offset-panel border-brand' : 'border-black/10'}`}
                      style={{ backgroundColor: c.hex ?? 'transparent' }}
                    />
                    <span className={`text-[0.72rem] ${on ? 'font-semibold text-brand' : 'text-body-muted'}`}>{c.nameAr}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* المقاسات — قابلة للاختيار */}
      {needsSize && (
        <div className="mt-7">
          <h2 className="mb-3 text-base font-semibold text-body">المقاس</h2>
          <ul className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const on = size === s;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setSize(on ? '' : s)}
                    aria-pressed={on}
                    className={`grid h-11 min-w-11 place-items-center rounded-xl border px-3.5 text-sm transition-colors ${on ? 'border-brand bg-brand-fill text-on-brand' : 'border-edge-strong text-body hover:border-brand'}`}
                  >
                    {s}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* الكمية + السعر */}
      <div className="mt-7 flex flex-wrap items-end gap-5">
        <label className="block">
          <span className="mb-2 block text-xs text-body-muted">الكمية</span>
          <div className="flex items-center rounded-xl border border-edge-strong">
            <button type="button" aria-label="أنقص" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3.5 py-2.5 text-body-muted hover:text-body">−</button>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              dir="ltr"
              className="w-16 bg-transparent py-2.5 text-center text-sm text-body outline-none"
            />
            <button type="button" aria-label="زد" onClick={() => setQty((q) => q + 1)} className="px-3.5 py-2.5 text-body-muted hover:text-body">+</button>
          </div>
        </label>

        <div className="min-w-0">
          <span className="mb-1 block text-xs text-body-muted">السعر التقريبي</span>
          <p className="text-sm font-semibold text-body">
            {ready ? (priceText || 'السعر حسب الطلب — نرجع لك بالتسعيرة') : 'اختر اللون والمقاس'}
          </p>
        </div>
      </div>

      {/* الأزرار */}
      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => add(true)}
          disabled={!ready}
          className="inline-flex items-center rounded-full bg-brand-fill px-8 py-4 text-sm font-bold text-on-brand shadow-[0_18px_40px_-16px_rgba(92,35,52,0.9)] transition-all hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-40"
        >
          اشترِ الآن
        </button>
        <button
          type="button"
          onClick={() => add(false)}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full border border-edge-strong px-8 py-4 text-sm font-medium text-body transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
        >
          {added ? '✓ أُضيف للسلّة' : 'أضف للسلّة'}
        </button>
      </div>
      {!ready && (needsColor || needsSize) && (
        <p className="mt-2 text-[0.7rem] text-body-subtle">اختر {needsColor ? 'اللون' : ''}{needsColor && needsSize ? ' و' : ''}{needsSize ? 'المقاس' : ''} لتفعيل الطلب.</p>
      )}
    </div>
  );
}
