'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { WHY_KAYAN } from '@/site';

/**
 * لماذا كيان؟
 *
 * Motion grammar: a hairline draws across each row as it enters, so the
 * section reads as a list being written rather than cards appearing. Third
 * distinct grammar on the page.
 */
export function WhyKayan() {
  return (
    <SectionShell id="why" label="لماذا كيان" size="tall" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1400px]">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.9, ease: EASE.outExpo }}
          className="mb-14 max-w-[24ch] font-display text-display-3 leading-[1.3] text-neutral-100"
        >
          لماذا <span className="text-accent">كيان</span>؟
        </motion.h2>

        <div className="grid gap-x-16 md:grid-cols-2">
          {WHY_KAYAN.map((reason, index) => (
            <motion.div
              key={reason.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, ease: EASE.outExpo, delay: (index % 2) * 0.1 }}
              className="relative py-8"
            >
              <motion.span
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: EASE.outExpo, delay: 0.2 }}
                className="absolute inset-x-0 top-0 block h-px origin-right bg-ink-800"
              />

              <div className="flex items-start gap-5">
                <span className="font-display text-2xl leading-none text-primary-700">
                  {reason.n}
                </span>
                <div>
                  <h3 className="font-display text-xl text-neutral-100">{reason.title}</h3>
                  <p className="mt-3 max-w-[42ch] text-sm leading-loose text-neutral-400">
                    {reason.body}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
