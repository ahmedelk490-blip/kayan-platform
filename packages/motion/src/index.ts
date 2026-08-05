'use client';

/**
 * @erp/motion — curves and durations, shared by both products.
 *
 * This package deliberately contains NO animated components. A shared
 * easing curve is brand; a shared scroll-jack component would violate the
 * component-independence rule of ADR-015. Marketing animation lives in
 * @erp/ui-market, ERP animation in @erp/ui-erp.
 */

import { useEffect, useState } from 'react';

/** Mirrors the --ease-* custom properties in @erp/brand/tokens.css. */
export const EASE = {
  outExpo: [0.16, 1, 0.3, 1],
  outQuart: [0.25, 1, 0.5, 1],
  inOutQuart: [0.76, 0, 0.24, 1],
} as const;

export const DURATION = {
  fast: 0.15,
  base: 0.3,
  slow: 0.6,
  cinematic: 1.2,
} as const;

/**
 * True when the visitor has asked for reduced motion.
 *
 * Returns `false` during SSR and on first client paint, then corrects after
 * hydration — so markup matches between server and client. Callers must treat
 * this as "reduce motion once known", never as a render gate that would cause
 * a hydration mismatch.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Standard entrance used across marketing sections. */
export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE.outExpo },
  },
} as const;

/** Stagger container for progressive reveal. */
export const staggerChildren = (stagger = 0.08, delayChildren = 0) =>
  ({
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren },
    },
  }) as const;
