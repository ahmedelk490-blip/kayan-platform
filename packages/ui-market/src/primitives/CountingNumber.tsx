'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView } from 'motion/react';
import { EASE, usePrefersReducedMotion } from '@erp/motion';
import { formatNumber } from '@erp/utils';

interface CountingNumberProps {
  value: number;
  locale?: 'en' | 'ar';
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  durationSeconds?: number;
}

/**
 * Number that counts up when scrolled into view.
 *
 * Uses `animate()` with an explicit duration rather than a spring bound to a
 * motion value. The spring version had a race: the subscribe-effect could run
 * after the spring settled, leaving the figure stranded at its seed value —
 * which it did, reproducibly, for one tile in a row of four.
 *
 * Writes to `textContent` directly rather than through state, so a 60fps
 * animation does not re-render the subtree on every frame.
 */
export function CountingNumber({
  value,
  locale = 'en',
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
  durationSeconds = 1.6,
}: CountingNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const format = (n: number) =>
      prefix +
      formatNumber(n, locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) +
      suffix;

    if (reducedMotion) {
      node.textContent = format(value);
      return;
    }

    if (!inView) return;

    const controls = animate(0, value, {
      duration: durationSeconds,
      ease: EASE.outExpo,
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
    });

    // Guarantee the final value even if the animation is interrupted.
    return () => {
      controls.stop();
      node.textContent = format(value);
    };
  }, [inView, value, locale, decimals, suffix, prefix, reducedMotion, durationSeconds]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatNumber(0, locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
