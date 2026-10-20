'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { track } from '@/lib/meta-pixel';
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
 * اختيار اللون وطلب عرض السعر.
 *
 * بطلب المالك: لا سلّة ولا مقاسات — الزبون يختار اللون (اختيارياً) ويضغط زراً
 * واحداً يفتح صفحة عرض السعر والمنتج واللون مختاران فيها. العدد ونوع الشغل
 * هناك. اختيار اللون ينقل المعرض لصورته (ProductGallery).
 *
 * Meta: اختيار اللون = CustomizeProduct، والضغط على الزر = InitiateCheckout
 * (نيّة طلب)، والإرسال الفعلي = Lead + CompleteRegistration من صفحة عرض السعر.
 */
export function ProductBuy({
  productId,
  productName,
  colors,
  tiers,
}: {
  productId: string;
  productName: string;
  colors: { nameAr: string; hex: string | null }[];
  tiers: Tier[];
}) {
  const [color, setColor] = useState('');

  function chooseColor(next: string, fromGallery = false) {
    setColor(next);
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
  }, []);

  // «يبدأ من»: أقلّ سعر يخصّ اللون المختار أو يعمّ كل الألوان.
  const priceFrom = useMemo(() => {
    const prices = tiers.filter((t) => t.color === null || !color || t.color === color).map((t) => t.price);
    return prices.length ? Math.min(...prices) : null;
  }, [tiers, color]);

  const href = `/quote?product=${encodeURIComponent(productId)}${color ? `&color=${encodeURIComponent(color)}` : ''}`;

  return (
    <div className="mt-9">
      {colors.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-body">
            اللون
            {color && <span className="ms-2 text-sm font-normal text-brand">{color}</span>}
          </h2>
          <ul className="flex flex-wrap gap-2.5">
            {colors.map((c) => {
              const on = color === c.nameAr;
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
                      style={{ background: swatchBackground(c.nameAr, c.hex) ?? 'transparent' }}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-7">
        <span className="mb-1 block text-xs text-body-muted">السعر</span>
        <p className="text-sm font-semibold text-body">
          {priceFrom ? `يبدأ من ${priceFrom.toLocaleString('en-US')} د.ع` : 'السعر حسب الطلب — نرجع لك بالتسعيرة'}
        </p>
      </div>

      <Link
        href={href}
        onClick={() =>
          track('InitiateCheckout', {
            content_ids: [productId],
            content_name: productName,
            content_type: 'product',
            ...(color ? { color } : {}),
          })
        }
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-brand-fill px-6 py-4 text-sm font-bold text-on-brand shadow-[0_18px_40px_-16px_rgba(92,35,52,0.9)] sm:w-auto sm:min-w-72"
      >
        اطلب عرض سعر
      </Link>
      <p className="mt-2 text-xs text-body-subtle">اختيار اللون اختياري — والعدد ونوع الشغل في الخطوة الجاية.</p>
    </div>
  );
}
