'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useMotionValue, useSpring, useTransform, type PanInfo } from 'motion/react';
import { Logo } from '@erp/brand/logo';
import { EASE, usePrefersReducedMotion } from '@erp/motion';
import { Parallax } from '@/components/site/Parallax';

/**
 * الواجهة الرئيسية — Hero بشرائح عمق (coverflow).
 *
 * المنتج في المنتصف كبير وحاد، وجاراه أصغر وأخفت وعليهما ضباب خفيف. النقر
 * على أي منهما يجعله المركز.
 *
 * ── Motion language: CINEMATIC ─────────────────────────────
 *
 * This is the loudest section on the page, deliberately, and every other
 * section is quieter than it. Depth, scale, blur and a tone shift — the
 * things that read as "expensive" — and nothing that loops. Movement happens
 * because the visitor asked for it: an arrow, a dot, a drag, a click on a
 * neighbour.
 *
 * ── Performance ────────────────────────────────────────────
 *
 * Only transform, opacity and filter are animated; nothing here can trigger
 * layout. `filter: blur()` is the one expensive property, so it is dropped
 * entirely on small screens and under reduced motion, where the deck flattens
 * to a plain cross-fade rather than pretending to have depth it cannot afford.
 */

/**
 * الشرائح تصل من الخادم بعد قراءتها من جدول Product.
 *
 * كانت مكتوبة هنا: المسار والاسم والوصف لكل شريحة. فمنتج يوقفه المدير
 * يبقى في الهيرو، ومنتج جديد لا يظهر فيه حتى يعدّل أحد الكود.
 *
 * التدرّج اللوني يُشتق من الترتيب لا من قاعدة البيانات: قيمة بصرية بحتة
 * لا يملكها العمل ولا معنى لتخزينها.
 */
export interface HeroSlide {
  src: string;
  name: string;
  note: string;
  tint: string;
}

const WORDS = ['كل', 'علامة', 'ناجحة', 'تبدأ', 'بكيان'];

/** 660ms — inside the 600–700 the brief asked for, on the brand's own curve. */
const SWITCH = { duration: 0.66, ease: EASE.outExpo };

export function Hero({ slides }: { slides: HeroSlide[] }) {
  const SLIDES = slides;

  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  /** Small screens get the same carousel with the depth costs removed. */
  const [simplified, setSimplified] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  /** Timestamp of the last accepted wheel step, for the cooldown. */
  const lastWheel = useRef(0);

  // SLIDES صارت مشتقّة من خاصيّة لا ثابتاً في الوحدة، فطولها اعتمادية
  // حقيقية: إغلاق قديم على عدد مختلف يدور على شريحة غير موجودة.
  const go = useCallback((delta: number) => {
    setActive((current) => (current + delta + SLIDES.length) % SLIDES.length);
  }, [SLIDES.length]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px), (pointer: coarse)');
    const apply = () => setSimplified(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  // ── Pointer parallax, desktop only ────────────────────────
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const driftX = useSpring(pointerX, { stiffness: 55, damping: 20, mass: 0.6 });
  const driftY = useSpring(pointerY, { stiffness: 55, damping: 20, mass: 0.6 });
  const tiltX = useTransform(driftY, [-0.5, 0.5], [5, -5]);
  const tiltY = useTransform(driftX, [-0.5, 0.5], [-7, 7]);

  useEffect(() => {
    if (reduced || simplified) return;

    function onMove(event: MouseEvent) {
      const box = deckRef.current?.getBoundingClientRect();
      if (!box) return;
      pointerX.set((event.clientX - box.left) / box.width - 0.5);
      pointerY.set((event.clientY - box.top) / box.height - 0.5);
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduced, simplified, pointerX, pointerY]);

  /**
   * العجلة فوق الـ Hero تغيّر المنتج.
   *
   * ── The rule that keeps this from being hostile ────────────
   *
   * Taking the wheel away from a visitor is a real accessibility cost, so it
   * is taken back the moment the carousel has nothing left to give:
   *
   *   - scrolling DOWN on the last product releases to the page
   *   - scrolling UP on the first product releases to the page
   *
   * That is why the wheel does NOT wrap, while the arrows and dots do. A
   * wrapping wheel would trap the reader in the hero forever, which is
   * exactly the behaviour that gives scroll-jacking its bad name.
   *
   * A 700ms cooldown, just over the 660ms transition, turns one flick of a
   * trackpad's momentum into one product rather than five. Disabled entirely
   * under reduced motion, where the page simply scrolls.
   */
  useEffect(() => {
    if (reduced) return;
    const node = sectionRef.current;
    if (!node) return;

    function onWheel(event: WheelEvent) {
      // Ctrl+wheel is the browser's zoom. Never take that.
      if (event.ctrlKey) return;
      if (Math.abs(event.deltaY) < 4) return;

      const forward = event.deltaY > 0;
      const exhausted = forward ? active === SLIDES.length - 1 : active === 0;
      if (exhausted) return; // hand the wheel back to the page

      event.preventDefault();

      const now = Date.now();
      if (now - lastWheel.current < 700) return;
      lastWheel.current = now;
      setActive((current) => current + (forward ? 1 : -1));
    }

    // passive:false because preventDefault is the whole mechanism.
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [reduced, active, SLIDES.length]);

  function onKeyDown(event: React.KeyboardEvent) {
    // RTL: ArrowLeft advances, because forward is leftward on this page.
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
    if (info.offset.x < -60) go(1);
    else if (info.offset.x > 60) go(-1);
  }

  /** Shortest signed distance on a ring, so wrapping does not fly across. */
  function ringOffset(index: number) {
    const half = SLIDES.length / 2;
    let offset = index - active;
    if (offset > half) offset -= SLIDES.length;
    if (offset < -half) offset += SLIDES.length;
    return offset;
  }

  const current = SLIDES[active];

  return (
    <section
      ref={sectionRef}
      id="top"
      dir="rtl"
      className="relative isolate flex min-h-[92svh] flex-col justify-center overflow-hidden bg-page pb-24 pt-24 md:pb-28 md:pt-28"
    >
      {/* نبرة السطح تنجرف مع المنتج النشط — تغيّر محسوس بلا أن يكون صاخباً */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ backgroundColor: current.tint }}
        transition={{ duration: 0.9, ease: EASE.outQuart }}
      />

      {/* حبيبات — تمنع تسطّح المساحة الفاتحة بلا صورة خلفية ثقيلة */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50 mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.055'/%3E%3C/svg%3E\")",
        }}
      />

      {/* اسم المنتج ضخماً خلف الصور — طبقة عمق، لا نص يُقرأ.
          ينجرف أبطأ من التمرير فيبدو أبعد. */}
      <Parallax
        distance={70}
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
      >
        <motion.span
          key={current.name}
          aria-hidden
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 0.055, y: 0 }}
          transition={{ duration: 0.9, ease: EASE.outExpo }}
          className="block select-none text-center text-[22vw] font-bold leading-none text-brand lg:text-[15vw]"
        >
          {current.name}
        </motion.span>
      </Parallax>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:px-16">
        {/* ── النص ── */}
        <div className="mx-auto max-w-[46rem] text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE.outExpo }}
            className="flex justify-center"
          >
            <Logo height={52} className="rounded-lg" />
          </motion.div>

          <h1 className="mt-7 text-[clamp(1.9rem,4.6vw,3.4rem)] font-semibold leading-[1.3] text-body">
            {WORDS.map((word, index) => (
              <span key={word}>
                {index > 0 ? ' ' : ''}
                <motion.span
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.16 + index * 0.075 }}
                  className={
                    word === 'بكيان'
                      ? 'inline-block text-brand'
                      : 'inline-block'
                  }
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE.outExpo, delay: 0.58 }}
            className="mt-5 text-base text-body-muted md:text-lg"
          >
            يلكات • تيشيرتات • زي الشركات والمطاعم
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE.outExpo, delay: 0.66 }}
            className="mt-2 text-sm text-body-subtle"
          >
            خامات مضمونة | موديلات حديثة | تطريز وطباعة بمعملنا
          </motion.p>
        </div>

        {/* ── الشرائح ── */}
        <div
          ref={deckRef}
          role="group"
          aria-roledescription="معرض صور"
          aria-label="منتجات كيان"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="relative mt-10 h-[300px] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 sm:h-[360px] lg:mt-12 lg:h-[420px]"
          style={{ perspective: 1400 }}
        >
          <motion.div
            drag={reduced ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={onDragEnd}
            style={reduced || simplified ? undefined : { rotateX: tiltX, rotateY: tiltY }}
            className="relative h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
          >
            {SLIDES.map((slide, index) => {
              const offset = ringOffset(index);
              const depth = Math.abs(offset);
              const isCentre = offset === 0;
              // Beyond the second neighbour there is nothing to see, but the
              // node stays mounted so its image is fetched and a later switch
              // is instant.
              const hidden = depth > 2;

              // RTL: the next slide sits to the LEFT of the active one.
              const shift = simplified ? 62 : 46;
              const x = -offset * shift;

              return (
                <motion.figure
                  key={slide.src}
                  aria-hidden={!isCentre}
                  initial={false}
                  animate={{
                    x: `${x}%`,
                    scale: isCentre ? 1 : simplified ? 0.82 : 0.86 - (depth - 1) * 0.12,
                    opacity: hidden ? 0 : isCentre ? 1 : 0.62 - (depth - 1) * 0.3,
                    filter:
                      reduced || simplified || isCentre
                        ? 'blur(0px)'
                        : `blur(${depth * 3}px)`,
                    rotateY: reduced || simplified ? 0 : offset * -9,
                  }}
                  transition={SWITCH}
                  style={{ zIndex: 30 - depth, pointerEvents: hidden ? 'none' : 'auto' }}
                  className="absolute inset-x-[12%] inset-y-0 mx-auto overflow-hidden rounded-[24px] bg-panel shadow-[0_30px_80px_-34px_rgba(30,11,17,0.5)] ring-1 ring-black/5 sm:inset-x-[18%]"
                >
                  {/* النقر على منتج جانبي يجعله المركز */}
                  {!isCentre && !hidden && (
                    <button
                      type="button"
                      onClick={() => setActive(index)}
                      aria-label={`إظهار ${slide.name}`}
                      className="absolute inset-0 z-10 cursor-pointer"
                    />
                  )}

                  <Image
                    src={slide.src}
                    alt={slide.name}
                    fill
                    sizes="(max-width: 640px) 76vw, (max-width: 1024px) 60vw, 44vw"
                    className="select-none object-cover"
                    // All six are preloaded: six small WebPs, and a carousel
                    // that stalls on first arrow press is worse than the cost.
                    priority
                    draggable={false}
                  />

                  {/* لمعة تمرّ مرة واحدة عند تغيّر المنتج النشط — مرتبطة
                      بالمفتاح فتُعاد مع كل تبديل، ولا تدور من تلقاء نفسها. */}
                  {isCentre && !reduced && (
                    <motion.span
                      key={`sheen-${slide.src}`}
                      aria-hidden
                      initial={{ x: '-120%' }}
                      animate={{ x: '120%' }}
                      transition={{ duration: 1.1, ease: EASE.outQuart, delay: 0.15 }}
                      className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/14 to-transparent"
                    />
                  )}

                  {isCentre && (
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/62 via-black/22 to-transparent p-5 pt-14 text-right">
                      <p className="text-lg font-medium text-white">{slide.name}</p>
                      <p className="mt-1 text-xs text-white/85">{slide.note}</p>
                    </figcaption>
                  )}
                </motion.figure>
              );
            })}
          </motion.div>
        </div>

        {/* ── التحكم والأزرار ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.8 }}
          className="mt-10 flex flex-col items-center gap-7"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="المنتج السابق"
              className="grid h-11 w-11 place-items-center rounded-full border border-edge-strong bg-panel text-lg text-body-muted transition-colors hover:border-brand hover:text-brand"
            >
              ›
            </button>

            <div className="flex items-center gap-1.5" role="tablist" aria-label="اختيار المنتج">
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
                      ? 'w-7 bg-brand-fill'
                      : 'w-1.5 bg-edge-strong hover:bg-body-subtle'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => go(1)}
              aria-label="المنتج التالي"
              className="grid h-11 w-11 place-items-center rounded-full border border-edge-strong bg-panel text-lg text-body-muted transition-colors hover:border-brand hover:text-brand"
            >
              ‹
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <MagneticCta href="#quote" reduced={reduced} primary>
              اطلب عرض سعر
            </MagneticCta>
            <MagneticCta href="#products" reduced={reduced}>
              تصفح منتجاتنا
            </MagneticCta>
          </div>
        </motion.div>
      </div>

      {/* الحافة السفلية تتدرّج إلى خلفية الصفحة الداكنة */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--color-bg)]"
      />
    </section>
  );
}

/**
 * زر يميل قليلاً نحو المؤشر.
 *
 * Capped at a few pixels: enough to feel responsive, never enough to move the
 * target out from under the pointer. Off entirely under reduced motion.
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
          ? 'inline-flex items-center rounded-full bg-brand-fill px-8 py-4 text-sm font-medium text-on-brand transition-colors hover:opacity-90'
          : 'inline-flex items-center rounded-full border border-edge-strong px-8 py-4 text-sm font-medium text-body transition-colors hover:border-brand hover:text-brand'
      }
    >
      {children}
    </motion.a>
  );
}
