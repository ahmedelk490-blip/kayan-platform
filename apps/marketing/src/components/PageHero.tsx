'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { AnimatedText } from '@erp/ui-market';

interface PageHeroProps {
  eyebrow: string;
  title: string;
  lead: string;
  meta?: { label: string; value: string }[];
}

/**
 * Inner-page hero — the shared grammar for /platform, /industries, /company
 * and /contact (07_UI_UX §10.5.2).
 *
 * Deliberately consistent rather than novel. A visitor here has already been
 * persuaded by the homepage and is now evaluating; a different treatment on
 * every page would read as incoherence, not craft — and no WebGL, so
 * comparison pages stay instant.
 */
export function PageHero({ eyebrow, title, lead, meta }: PageHeroProps) {
  return (
    <header className="relative overflow-hidden px-6 pb-16 pt-40 md:px-10 md:pb-20 md:pt-48 lg:px-16">
      <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.18]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink-700 to-transparent"
      />

      <div className="relative mx-auto w-full max-w-[1400px]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE.outExpo }}
          className="mb-7 flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-neutral-400"
        >
          <span className="h-px w-10 bg-accent" />
          {eyebrow}
        </motion.div>

        <h1 className="max-w-[20ch] font-display text-display-2 leading-[0.98] text-neutral-100">
          <AnimatedText text={title} by="word" />
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE.outExpo, delay: 0.35 }}
          className="mt-7 max-w-[58ch] text-lead leading-relaxed text-neutral-400"
        >
          {lead}
        </motion.p>

        {meta && (
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-14 flex flex-wrap gap-x-12 gap-y-6 border-t border-ink-800 pt-7"
          >
            {meta.map((item) => (
              <div key={item.label}>
                <dt className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-500">
                  {item.label}
                </dt>
                <dd className="mt-1.5 font-display text-sm text-neutral-200">{item.value}</dd>
              </div>
            ))}
          </motion.dl>
        )}
      </div>
    </header>
  );
}
