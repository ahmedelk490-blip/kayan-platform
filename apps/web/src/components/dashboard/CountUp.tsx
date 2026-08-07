'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';

/**
 * رقم يعدّ تصاعدياً عند ظهوره.
 *
 * Counts once, on first entry, and never again — a figure that re-animates
 * every time it scrolls past is a distraction in a screen someone reads all
 * day. Honours prefers-reduced-motion by showing the final value outright.
 *
 * Arabic-Indic digits would be more authentic but are harder to compare down
 * a column at a glance, so figures stay Western with tabular spacing.
 */
export function CountUp({
  value,
  duration = 900,
  decimals = 0,
}: {
  value: number;
  duration?: number;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || value === 0) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo — fast arrival, gentle settle.
      const eased = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className="tnum">
      {display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}
