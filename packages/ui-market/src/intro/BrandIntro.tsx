'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BRAND } from '@erp/brand';
import { Logo } from '@erp/brand/logo';
import { EASE, usePrefersReducedMotion } from '@erp/motion';

const SEEN_KEY = 'kayan-intro-seen';

/** كم تبقى المقدمة قبل أن تنسحب تلقائياً (ثوانٍ). قصيرة عمداً. */
const HOLD_MS = 1300;

/**
 * مقدمة العلامة — كشفٌ سريع للّوجو، خفيف بلا ثلاثيّ أبعاد.
 *
 * كانت تشغّل مشهد WebGL جسيماً (ضوء ← خيط ← قماش…) يظهر شاشةً سوداء ثوانيَ
 * وهو يُحمّل قبل أن يبين اللوجو — وهو ما شكا منه المالك. صارت الآن كشفاً
 * بسيطاً: خلفية داكنة، يظهر عليها اللوجو والشعار في أقل من ثانية، ثم تنسحب
 * كاشفةً الصفحة. لا كانفس، لا شيدرات تُترجَم، فلا شاشة سوداء ولا انتظار.
 *
 * تُعرض مرة واحدة لكل جلسة، وتُتخطّى بأول لمسة، وتُلغى تماماً مع «تقليل الحركة».
 */
export function BrandIntro() {
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const finish = useCallback(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
    document.body.style.overflow = '';
    setPlaying(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = false;
    }
    if (!seen) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (reducedMotion) {
      finish();
      return;
    }
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(finish, HOLD_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [playing, reducedMotion, finish]);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {playing && !reducedMotion && (
        <motion.div
          key="intro"
          role="dialog"
          aria-label={`${BRAND.name} introduction`}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE.outExpo }}
          className="fixed inset-0 z-[99] grid place-items-center bg-ink-950"
        >
          {/* توهّج نبيتيّ خفيف خلف اللوجو — عمق بلا صورة ثقيلة. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-brand-fill) 24%, transparent), transparent)' }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: EASE.outExpo }}
            className="relative z-[101] flex flex-col items-center gap-6"
          >
            <Logo height={132} className="rounded-2xl shadow-2xl" />
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6, ease: EASE.outExpo }}
              className="px-6 text-center text-xs uppercase tracking-[0.28em] text-accent"
            >
              {BRAND.slogan.en}
            </motion.p>
          </motion.div>

          {/* أيّ لمسة تتخطّى المقدمة فوراً. */}
          <button
            type="button"
            onClick={finish}
            aria-label="تخطّي المقدمة"
            className="absolute inset-0 z-[102] cursor-pointer"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
