'use client';

import { useEffect, useMemo, useState } from 'react';
import { addToCart, itemKey, openCart } from '@/lib/cart';
import { track, toMetaValue, META_CURRENCY } from '@/lib/meta-pixel';
import { swatchBackground } from '@/lib/color-swatch';
import { COLOR_EVENT, PICK_COLOR_EVENT } from './ProductGallery';

interface Tier {
  service: string;
  minQty: number;
  maxQty: number | null;
  price: number;
  currency: string;
  color: string | null;
}

/**
 * اختيار المنتج وإضافته للسلّة.
 *
 * بطلب المالك: ألوان المنتج المتوفّرة وحدها، كلٌّ بشكل لونه؛ ثم المقاسات
 * المتاحة لهذا اللون فقط؛ بلا خانات كمية هنا — الكمية تُعدَّل في السلّة.
 * اختيار اللون ينقل المعرض لصورته (ProductGallery).
 */
export function ProductBuy({
  productId,
  productName,
  image,
  colors,
  sizes,
  sizesByColor,
  tiers,
}: {
  productId: string;
  productName: string;
  image: string | null;
  colors: { nameAr: string; hex: string | null }[];
  sizes: string[];
  sizesByColor: Record<string, string[]>;
  tiers: Tier[];
}) {
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [added, setAdded] = useState(false);

  const available = color && sizesByColor[color]?.length ? sizesByColor[color] : sizes;
  const needsColor = colors.length > 0;
  const needsSize = available.length > 0;
  // بطلب المالك: اختيار اللون والمقاس اختياري — الزبون يقدر يضيف للسلّة مباشرة،
  // والتفاصيل تُكمَل مع المندوب. ما يُختار يُرسل مع الطلب.
  const ready = true;

  function chooseColor(next: string, fromGallery = false) {
    setColor(next);
    // مقاس غير متاح في اللون الجديد يُلغى بدل أن يُطلب ما لا يوجد.
    const nextSizes = next && sizesByColor[next]?.length ? sizesByColor[next] : sizes;
    setSize((s) => (nextSizes.includes(s) ? s : ''));
    if (!next) return;
    if (!fromGallery) window.dispatchEvent(new CustomEvent(COLOR_EVENT, { detail: next }));
    track('CustomizeProduct', { content_ids: [productId], content_name: productName, content_type: 'product', color: next });
  }

  // صورة مربوطة بلون ضُغطت في المعرض ⇒ يُختار لونها هنا.
  useEffect(() => {
    const onPick = (e: Event) => chooseColor((e as CustomEvent<string>).detail, true);
    window.addEventListener(PICK_COLOR_EVENT, onPick);
    return () => window.removeEventListener(PICK_COLOR_EVENT, onPick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizesByColor, sizes]);

  // «يبدأ من»: أقلّ سعر يخصّ اللون المختار أو يعمّ كل الألوان.
  const priceFrom = useMemo(() => {
    const prices = tiers.filter((t) => t.color === null || !color || t.color === color).map((t) => t.price);
    return prices.length ? Math.min(...prices) : null;
  }, [tiers, color]);
  const priceText = priceFrom ? `يبدأ من ${priceFrom.toLocaleString('en-US')} د.ع` : '';

  function add(openAfter: boolean) {
    if (!ready) return;
    addToCart({
      key: itemKey(productId, color || undefined, size || undefined),
      productId,
      productName,
      image,
      colorLabel: color || undefined,
      sizeLabel: size || undefined,
      quantity: 1,
      priceText: priceText || undefined,
    });
    track('AddToCart', {
      content_ids: [productId],
      content_name: productName,
      content_type: 'product',
      num_items: 1,
      value: toMetaValue(priceFrom ?? 0),
      currency: META_CURRENCY,
    });
    if (openAfter) openCart();
    else {
      setAdded(true);
      setTimeout(() => setAdded(false), 2200);
    }
  }

  return (
    <div className="mt-9">
      {needsColor && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-body">
            اللون
            {color && <span className="ms-2 text-sm font-normal text-brand">{color}</span>}
          </h2>
          <ul className="flex flex-wrap gap-2.5">
            {colors.map((c) => {
              const on = color === c.nameAr;
              const bg = swatchBackground(c.nameAr, c.hex);
              return (
                <li key={c.nameAr}>
                  <button
                    type="button"
                    onClick={() => chooseColor(on ? '' : c.nameAr)}
                    aria-pressed={on}
                    aria-label={c.nameAr}
                    title={c.nameAr}
                    className={`grid h-12 w-12 place-items-center rounded-full border-2 ${on ? 'border-brand' : 'border-transparent'}`}
                  >
                    <span
                      className="h-9 w-9 rounded-full border border-edge-strong shadow-[inset_0_2px_6px_rgba(0,0,0,0.2)]"
                      style={{ background: bg ?? 'transparent' }}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {needsSize && (
        <div className="mt-7">
          <h2 className="mb-3 text-base font-semibold text-body">
            المقاس
            {size && <span className="ms-2 text-sm font-normal text-brand">{size}</span>}
          </h2>
          <ul className="flex flex-wrap gap-2.5">
            {available.map((s) => {
              const on = size === s;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setSize(on ? '' : s)}
                    aria-pressed={on}
                    dir="ltr"
                    className={`min-w-14 rounded-xl border px-4 py-2.5 text-sm font-medium ${
                      on ? 'border-brand bg-brand-fill text-on-brand' : 'border-edge-strong text-body'
                    }`}
                  >
                    {s}
                  </button>
                </li>
              );
            })}
          </ul>
          {color && <p className="mt-2 text-xs text-body-subtle">المقاسات المتاحة لهذا اللون فقط.</p>}
        </div>
      )}

      <div className="mt-7">
        <span className="mb-1 block text-xs text-body-muted">السعر</span>
        <p className="text-sm font-semibold text-body">{priceText || 'السعر حسب الطلب — نرجع لك بالتسعيرة'}</p>
      </div>

      <p className="mt-2 text-xs text-body-subtle">اللون والمقاس اختياريان — والكمية تحددها في السلّة.</p>

      {/* أزرار الشراء: عمودان متساويان، وتحتها صفّ عرض السعر وواتساب بنفس المقاس. */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => add(true)}
          disabled={!ready}
          className="inline-flex w-full items-center justify-center rounded-full bg-brand-fill px-4 py-3.5 text-sm font-bold text-on-brand shadow-[0_18px_40px_-16px_rgba(92,35,52,0.9)] disabled:opacity-40"
        >
          اشترِ الآن
        </button>
        <button
          type="button"
          onClick={() => add(false)}
          disabled={!ready}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-edge-strong px-4 py-3.5 text-sm font-medium text-body disabled:opacity-40"
        >
          {added ? '✓ أُضيف للسلّة' : 'أضف للسلّة'}
        </button>
      </div>
    </div>
  );
}
