'use client';

import { motion } from 'motion/react';
import { BRAND } from '@erp/brand';
import { EASE } from '@erp/motion';
import { AnimatedText, MagneticButton, SceneAnchor } from '@erp/ui-market';

/**
 * WOW Moment #1 — Cinematic Hero.
 * Interaction grammar: autoplay + scroll-dolly. The visitor does nothing.
 *
 * The 3D layer assembles 8,400 scattered points into an ordered weave while
 * data annotations resolve alongside — physical product and the system
 * reading it, in one shot (07_UI_UX §4.6).
 */
export function Hero() {
  return (
    <SceneAnchor scene="hero" className="relative min-h-[190vh]" offset={['start start', 'end end']}>
      <div id="top" className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.28]" />
        {/* Vignette keeps headline contrast at AA over the particle field. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,var(--color-steel-950)_78%)]" />

        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.15 }}
            className="mb-8 flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-steel-400"
          >
            <span className="h-px w-10 bg-accent" />
            Enterprise ERP for makers
          </motion.div>

          <h1 className="max-w-[16ch] font-display text-display-1 leading-[0.92] text-steel-100">
            <AnimatedText text="Every stitch." by="word" />
            <br />
            <AnimatedText text="Every sheet." by="word" delay={0.12} />
            <br />
            <span className="text-accent">
              <AnimatedText text="Every pound." by="word" delay={0.24} />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.75 }}
            className="mt-8 max-w-[46ch] text-lead leading-relaxed text-steel-300"
          >
            One system for printing, embroidery, uniform manufacturing and safety equipment —
            where every cost can tell you exactly where it came from.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.9 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <MagneticButton href="#cta">Request a demo</MagneticButton>
            <MagneticButton href="#making" variant="outline">
              See how it works
            </MagneticButton>
          </motion.div>

          {/* Data annotations — the digital half reading the physical. */}
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.3 }}
            className="mt-16 hidden gap-10 border-t border-steel-800 pt-6 md:flex"
          >
            {[
              { label: 'Stitches tracked', value: '8,400' },
              { label: 'Design', value: 'DSN-0042' },
              { label: 'Standard', value: 'EN ISO 20471' },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[0.65rem] uppercase tracking-[0.18em] text-steel-500">
                  {item.label}
                </dt>
                <dd className="mt-1 font-display text-sm text-steel-200">{item.value}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-steel-500"
        >
          <span>Scroll</span>
          <motion.span
            animate={{ scaleY: [0.2, 1, 0.2], originY: 0 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="block h-8 w-px bg-steel-600"
          />
        </motion.div>
      </div>

      <span className="sr-only">
        {BRAND.name} — {BRAND.tagline.en}
      </span>
    </SceneAnchor>
  );
}
