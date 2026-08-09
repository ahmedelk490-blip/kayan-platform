'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useMotionValue, useSpring, useTransform, type PanInfo } from 'motion/react';
import { Logo } from '@erp/brand/logo';
import { EASE, usePrefersReducedMotion } from '@erp/motion';

/**
 * الواجهة الرئيسية — Hero.
 *
 * سطح فاتح عاجي داخل صفحة داكنة، بطلب صريح. الحافة السفلية تتدرّج إلى خلفية
 * الصفحة حتى يُقرأ الانتقال مقصوداً لا مكسوراً.
 *
 * ── Colour ─────────────────────────────────────────────────
 *
 * Every maroon here is `--color-primary-600` from @erp/brand, never a literal.
 * The brief quotes #5C2535 and the token holds #5c2334, sampled from the logo
 * file itself — about one shade apart. Hardcoding the brief's value would fork
 * the brand colour into two slightly different maroons, which is exactly what
 * the token exists to prevent, so the token wins and the discrepancy is
 * reported rather than silently resolved.
 *
 * ── The logo ───────────────────────────────────────────────
 *
 * Rendered through the shared `Logo` component, which only ever scales the
 * supplied asset proportionally. It is never redrawn, recoloured or stretched.
 *
 * ── Motion ─────────────────────────────────────────────────
 *
 * Entrance only — no continuous loop. Parallax follows the pointer on desktop
 * and is switched off entirely for touch and for anyone who has asked for
 * reduced motion, in which case the deck simply cross-fades.
 */

/** Real photographs from the factory. No stock imagery, no invented products. */
const SLIDES = [
  {
    src: '/products/tshirts/tshirts-001/01.webp',
    name: 'التيشيرتات',
    note: 'قطن مفرّز · يقبل الطباعة والتطريز',
  },
  {
    src: '/products/vest-turkish/vest-turkish-001/01.webp',
    name: 'اليلك التركي',
    note: 'شرائط عاكسة · خياطة مقوّاة',
  },
  {
    src: '/products/vest-chinese/vest-chinese-001/01.webp',
    name: 'اليلك الصيني',
    note: 'خيار اقتصادي للكميات',
  },
  {
    src: '/products/aprons/aprons-001/01.webp',
    name: 'المرايل',
    note: 'مطاعم وكافيهات ومصانع',
  },
  {
    src: '/products/shemagh/shemagh-001/01.webp',
    name: 'الشماغ',
    note: 'تفصيل حسب الطلب',
  },
  {
    src: '/products/tshirts/tshirts-002/01.webp',
    name: 'البولو',
    note: 'ياقة وقصّة أقرب للرسمي',
  },
];

const WORDS = ['كل', 'علامة', 'ناجحة', 'تبدأ', 'بكيان'];

/** Cards beyond this distance from the active one are not rendered at all. */
const VISIBLE = 2;

export function Hero() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const deckRef = useRef<HTMLDivElement>(null);

  const go = useCallback((delta: number) => {
    setActive((current) => {
      const next = current + delta;
      if (next < 0) return SLIDES.length - 1;
      if (next >= SLIDES.length) return 0;
      return next;
    });
  }, []);

  // ── Pointer parallax, desktop only ────────────────────────
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const driftX = useSpring(pointerX, { stiffness: 60, damping: 20, mass: 0.6 });
  const driftY = useSpring(pointerY, { stiffness: 60, damping: 20, mass: 0.6 });
  const tiltX = useTransform(driftY, [-0.5, 0.5], [6, -6]);
  const tiltY = useTransform(driftX, [-0.5, 0.5], [-8, 8]);

  useEffect(() => {
    if (reduced) return;
    // A coarse pointer means touch: there is no hover to follow, and reading
    // finger position as parallax makes the deck twitch during a swipe.
    if (window.matchMedia('(pointer: coarse)').matches) return;

    function onMove(event: MouseEvent) {
      const box = deckRef.current?.getBoundingClientRect();
      if (!box) return;
      pointerX.set((event.clientX - box.left) / box.width - 0.5);
      pointerY.set((event.clientY - box.top) / box.height - 0.5);
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduced, pointerX, pointerY]);

  // ── Keyboard ──────────────────────────────────────────────
  function onKeyDown(event: React.KeyboardEvent) {
    // RTL: ArrowLeft advances, because "forward" is leftward on this page.
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(-1);
    }
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const threshold = 60;
    if (info.offset.x < -threshold) go(1);
    else if (info.offset.x > threshold) go(-1);
  }

  return (
    <section
      id="top"
      dir="rtl"
      className="relative isolate overflow-hidden bg-[var(--color-neutral-50)] pb-32 pt-28 md:pb-40 md:pt-32"
    >
      {/* حبيبات خفيفة جداً — تمنع تسطّح المساحة البيضاء بلا صورة خلفية ثقيلة */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.055'/%3E%3C/svg%3E\")",
        }}
      />

      {/* هالة مارونية شديدة الخفوت خلف الصور */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 start-[-10%] h-[560px] w-[560px] rounded-full opacity-[0.07] blur-[130px]"
        style={{ background: 'var(--color-primary-600)' }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] items-center gap-16 px-6 md:px-10 lg:grid-cols-[1.02fr_1fr] lg:gap-20 lg:px-16">
        {/* ── النص ── */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE.outExpo }}
          >
            <Logo height={58} className="rounded-lg" />
          </motion.div>

          <h1 className="mt-9 text-[clamp(2.1rem,5.2vw,3.9rem)] font-semibold leading-[1.28] text-[var(--color-neutral-900)]">
            {WORDS.map((word, index) => (
              <span key={word}>
                {index > 0 ? ' ' : ''}
                <motion.span
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.18 + index * 0.08 }}
                  className={
                    word === 'بكيان'
                      ? 'inline-block text-[var(--color-primary-600)]'
                      : 'inline-block'
                  }
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE.outExpo, delay: 0.62 }}
            className="mt-7 text-lg text-[var(--color-neutral-700)] md:text-xl"
          >
            يلكات • تيشيرتات • زي الشركات والمطاعم
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE.outExpo, delay: 0.72 }}
            className="mt-3 text-sm tracking-[0.02em] text-[var(--color-neutral-600)]"
          >
            خامات ممتازة | ستايلات عصرية | تطريز وطباعة
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.84 }}
            className="mt-11 flex flex-wrap items-center gap-4"
          >
            <MagneticCta href="#quote" reduced={reduced} primary>
              اطلب عرض سعر
            </MagneticCta>
            <MagneticCta href="#products" reduced={reduced}>
              استكشف منتجاتنا
            </MagneticCta>
          </motion.div>
        </div>

        {/* ── الصور ── */}
        <div
          ref={deckRef}
          role="group"
          aria-roledescription="معرض صور"
          aria-label="منتجات كيان"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="relative h-[380px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-600)] focus-visible:ring-offset-4 sm:h-[460px] lg:h-[540px]"
        >
          <motion.div
            drag={reduced ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={onDragEnd}
            style={reduced ? undefined : { rotateX: tiltX, rotateY: tiltY }}
            className="relative h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
          >
            {SLIDES.map((slide, index) => {
              const offset = index - active;
              if (Math.abs(offset) > VISIBLE) return null;

              const depth = Math.abs(offset);
              return (
                <motion.figure
                  key={slide.src}
                  aria-hidden={offset !== 0}
                  initial={{ opacity: 0, y: 34, scale: 0.94 }}
                  animate={{
                    // RTL: later cards stack to the left of the active one.
                    x: reduced ? 0 : offset * -52,
                    y: depth * 16,
                    scale: 1 - depth * 0.07,
                    opacity: offset === 0 ? 1 : 0.55 - depth * 0.14,
                    rotate: reduced ? 0 : offset * -1.6,
                  }}
                  transition={{ duration: reduced ? 0.2 : 0.75, ease: EASE.outExpo }}
                  style={{ zIndex: 20 - depth }}
                  className="absolute inset-0 overflow-hidden rounded-[26px] bg-white shadow-[0_28px_70px_-30px_rgba(30,11,17,0.45)] ring-1 ring-black/5"
                >
                  <Image
                    src={slide.src}
                    alt={slide.name}
                    fill
                    sizes="(max-width: 1024px) 90vw, 44vw"
                    className="select-none object-cover"
                    priority={index === 0}
                    draggable={false}
                  />

                  {offset === 0 && (
                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/62 via-black/25 to-transparent p-6 pt-16">
                      <p className="text-lg font-medium text-white">{slide.name}</p>
                      <p className="mt-1 text-xs text-white/80">{slide.note}</p>
                    </figcaption>
                  )}
                </motion.figure>
              );
            })}
          </motion.div>

          {/* ── التحكم ── */}
          <div className="absolute -bottom-16 start-0 flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="المنتج السابق"
              className="grid h-11 w-11 place-items-center rounded-full border border-[var(--color-neutral-500)] bg-white text-[var(--color-neutral-700)] transition-colors hover:border-[var(--color-primary-600)] hover:text-[var(--color-primary-600)]"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="المنتج التالي"
              className="grid h-11 w-11 place-items-center rounded-full border border-[var(--color-neutral-500)] bg-white text-[var(--color-neutral-700)] transition-colors hover:border-[var(--color-primary-600)] hover:text-[var(--color-primary-600)]"
            >
              ‹
            </button>

            <div className="ms-2 flex items-center gap-1.5" role="tablist" aria-label="اختيار المنتج">
              {SLIDES.map((slide, index) => (
                <button
                  key={slide.src}
                  type="button"
                  role="tab"
                  aria-selected={index === active}
                  aria-label={slide.name}
                  onClick={() => setActive(index)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === active
                      ? 'w-7 bg-[var(--color-primary-600)]'
                      : 'w-1.5 bg-[var(--color-neutral-300)] hover:bg-[var(--color-neutral-400)]'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* الحافة السفلية تتدرّج إلى خلفية الصفحة الداكنة، فيُقرأ الانتقال مقصوداً */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[var(--color-bg)]"
      />
    </section>
  );
}

/**
 * زر يميل قليلاً نحو المؤشر.
 *
 * Movement is capped at a few pixels: enough to feel responsive, not enough
 * to move the target out from under the pointer. Disabled entirely under
 * reduced motion, where the button simply sits still.
 */
function MagneticCta({
  href,
  children,
  primary,
  reduced,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
  reduced: boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 240, damping: 18 });
  const springY = useSpring(y, { stiffness: 240, damping: 18 });

  function onMove(event: React.MouseEvent<HTMLAnchorElement>) {
    if (reduced) return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - box.left) / box.width - 0.5) * 14);
    y.set(((event.clientY - box.top) / box.height - 0.5) * 10);
  }

  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.a
      href={href}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={reduced ? undefined : { x: springX, y: springY }}
      className={
        primary
          ? 'inline-flex items-center rounded-full bg-[var(--color-primary-600)] px-8 py-4 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-700)]'
          : 'inline-flex items-center rounded-full border border-[var(--color-neutral-500)] px-8 py-4 text-sm font-medium text-[var(--color-neutral-800)] transition-colors hover:border-[var(--color-primary-600)] hover:text-[var(--color-primary-600)]'
      }
    >
      {children}
    </motion.a>
  );
}
