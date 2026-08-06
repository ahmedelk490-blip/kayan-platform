'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BRAND } from '@erp/brand';
import { Logo } from '@erp/brand/logo';
import { EASE, usePrefersReducedMotion } from '@erp/motion';
import { useSceneStore } from '../canvas/scene-store';
import { introClock } from './intro-clock';
import { INTRO_DURATION, PHASES } from './intro-phases';

const SEEN_KEY = 'kayan-intro-seen';

/**
 * The permanent opening signature.
 *
 * Light → thread → fabric → printing → uniform → digital → ERP network →
 * the official KAYAN logo → the homepage.
 *
 * ⚠ This component owns NO canvas. It drives the single shared canvas via the
 * scene store — a second <Canvas> ran two WebGL contexts at once and produced
 * `THREE.WebGLRenderer: Context Lost`. One persistent canvas, always.
 *
 * The logo is never animated as geometry, never redrawn, never distorted. It
 * is the supplied asset, revealed: the particle field dissolves outward and
 * the mark scales from 0.92. <Logo/> fixes the aspect ratio, so no keyframe
 * here can stretch it.
 *
 * Plays once per browser session and is always skippable — a signature that
 * traps a returning visitor is an obstacle, not a signature.
 */
export function BrandIntro() {
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const setIntroActive = useSceneStore((s) => s.setIntroActive);

  const finish = useCallback(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
    document.body.style.overflow = '';
    introClock.elapsed = 0;
    // Release the canvas. Whichever SceneAnchor is in view already recorded
    // itself as the desired scene, so it takes over on the next render.
    setIntroActive(false);
    setPlaying(false);
  }, [setIntroActive]);

  useEffect(() => {
    setMounted(true);
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = false; // private mode — play it rather than crash
    }
    if (!seen) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;

    // Reduced motion: no sequence at all. Mark seen, let the page through.
    if (reducedMotion) {
      finish();
      return;
    }

    document.body.style.overflow = 'hidden';
    introClock.elapsed = 0;
    setIntroActive(true);

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      introClock.elapsed = (now - start) / 1000;
      if (introClock.elapsed >= INTRO_DURATION) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') finish();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [playing, reducedMotion, finish, setIntroActive]);

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
          transition={{ duration: 0.7, ease: EASE.outExpo }}
          className="fixed inset-0 z-[99]"
        >
          {/* Backdrop sits BELOW the shared canvas (z-100) so the sequence
              shows through; the logo layer sits above it. */}
          <div className="absolute inset-0 bg-ink-950" />

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: PHASES[7].at, duration: 1.0, ease: EASE.outExpo }}
            className="absolute inset-0 z-[101] flex flex-col items-center justify-center gap-7"
          >
            <Logo height={132} className="rounded-2xl shadow-2xl" />
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: PHASES[7].at + 0.45, duration: 0.8, ease: EASE.outExpo }}
              className="px-6 text-center text-xs uppercase tracking-[0.28em] text-accent"
            >
              {BRAND.slogan.en}
            </motion.p>
          </motion.div>

          <button
            type="button"
            onClick={finish}
            className="absolute bottom-8 end-8 z-[101] rounded-full border border-ink-700 bg-ink-950/60 px-5 py-2 text-xs uppercase tracking-[0.16em] text-neutral-400 backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Skip
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
