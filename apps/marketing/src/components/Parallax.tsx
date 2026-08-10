'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';
import { usePrefersReducedMotion } from '@erp/motion';

/**
 * انجراف مرتبط بالتمرير.
 *
 * The element travels at a slightly different rate from the page, which is
 * what reads as depth. Deliberately small — 20 to 60 pixels across a whole
 * section. Large parallax on a business site looks like a template.
 *
 * ── Two rules that keep this from misbehaving ───────────────
 *
 * It only ever moves on Y, and only by a transform, so it can never widen the
 * page or trigger layout. And the movement is spring-smoothed rather than
 * bound directly to scroll position: Lenis already eases the scroll, and
 * stacking a raw scroll binding on top of that reads as jitter.
 *
 * Under reduced motion the wrapper renders its children and nothing else.
 */
export function Parallax({
  children,
  /** Pixels of travel across the element's full pass through the viewport. */
  distance = 40,
  className,
}: {
  children: ReactNode;
  distance?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const raw = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  const y = useSpring(raw, { stiffness: 90, damping: 26, mass: 0.5 });

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}

/**
 * كشف الصورة — قناع يتراجع.
 *
 * The image sits slightly over-scaled behind a clip that opens upward. Both
 * are composited properties, so the reveal costs nothing on the main thread.
 *
 * Preferred over a plain fade for photography: a fade makes a product look
 * like it is loading, while a wipe makes it look presented.
 */
export function ImageReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ clipPath: 'inset(14% 0% 0% 0%)', scale: 1.06, opacity: 0 }}
      whileInView={{ clipPath: 'inset(0% 0% 0% 0%)', scale: 1, opacity: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
