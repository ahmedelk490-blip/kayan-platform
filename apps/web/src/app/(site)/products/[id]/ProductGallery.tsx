'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

/** يتبادل المعرض واختيار اللون الحدثين: اختيار لون يعرض صورته، والعكس. */
export const COLOR_EVENT = 'kayan:color';
export const PICK_COLOR_EVENT = 'kayan:pick-color';

/**
 * معرض صور المنتج.
 *
 * بطلب المالك: الزبون يقلّب الصور بنفسه، واختيار لون ينقله لصورته. صورة
 * مربوطة بلون (من صفحة المنتج في النظام) تختار لونها حين يُضغط عليها.
 */
export function ProductGallery({
  name,
  images,
  imageColors,
}: {
  name: string;
  images: string[];
  imageColors: (string | null)[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onColor = (e: Event) => {
      const color = (e as CustomEvent<string>).detail;
      const i = imageColors.indexOf(color);
      if (i >= 0) setIndex(i);
    };
    window.addEventListener(COLOR_EVENT, onColor);
    return () => window.removeEventListener(COLOR_EVENT, onColor);
  }, [imageColors]);

  function pick(i: number) {
    setIndex(i);
    const color = imageColors[i];
    if (color) window.dispatchEvent(new CustomEvent(PICK_COLOR_EVENT, { detail: color }));
  }

  const current = images[index] ?? null;

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-panel-2 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.6)]">
        {current ? (
          <Image
            key={current}
            src={current}
            alt={imageColors[index] ? `${name} — ${imageColors[index]}` : name}
            fill
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-cover"
            priority={index === 0}
          />
        ) : (
          <div className="grid h-full place-items-center text-body-subtle">لا صورة</div>
        )}
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="الصورة السابقة"
              onClick={() => pick((index - 1 + images.length) % images.length)}
              className="absolute start-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-xl text-white"
            >
              ›
            </button>
            <button
              type="button"
              aria-label="الصورة التالية"
              onClick={() => pick((index + 1) % images.length)}
              className="absolute end-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-xl text-white"
            >
              ‹
            </button>
            <span className="tnum absolute bottom-3 start-3 rounded-full bg-black/50 px-3 py-1 text-xs text-white" dir="ltr">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <ul className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => pick(i)}
                aria-label={imageColors[i] ? `صورة ${imageColors[i]}` : `الصورة ${i + 1}`}
                aria-pressed={i === index}
                className={`relative block h-24 w-20 overflow-hidden rounded-xl border-2 bg-panel-2 ${
                  i === index ? 'border-brand' : 'border-transparent opacity-75'
                }`}
              >
                <Image src={src} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
