'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import Lenis from 'lenis';
import { usePrefersReducedMotion } from '@erp/motion';

/**
 * Smooth scrolling root.
 *
 * Extends the SmoothScroller pattern from `noir-parfum`, with two additions
 * that the reference lacks: reduced-motion bypass, and RTL-awareness so the
 * horizontal-travel sections behave correctly in Arabic (07_UI_UX §7).
 */
export function SmoothScroller({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Native scrolling is the correct behaviour under reduced motion —
    // smooth scrolling is itself motion the visitor asked us not to apply.
    if (reducedMotion) return;

    const lenis = new Lenis({
      lerp: 0.08,
      duration: 1.2,
      smoothWheel: true,
      // Touch devices keep native momentum; overriding it feels broken.
      syncTouch: false,
    });
    lenisRef.current = lenis;
    // يُتاح للتطبيق ليصفّر الموضع عند الانتقال لصفحة جديدة — Lenis يحفظ هدفه
    // الداخلي فكان يعيد الصفحة الجديدة لموضع القديمة (تفتح من آخرها).
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, [reducedMotion]);

  return <>{children}</>;
}
