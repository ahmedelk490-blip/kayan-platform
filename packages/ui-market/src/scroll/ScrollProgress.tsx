'use client';

import { motion, useScroll, useSpring } from 'motion/react';

/** Page-level reading progress bar. Fixed, non-interactive, decorative. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-px origin-left bg-accent"
    />
  );
}
