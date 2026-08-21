'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { SectionHeading } from '@/components/site/SectionHeading';
import { WHY_KAYAN } from '@/site';

/**
 * ليش كيان.
 *
 * قائمة تُرسم خطوطها أفقياً سطراً بعد سطر — إيقاع مختلف عن البطاقات، وأقرب
 * لقراءة قائمة أسباب.
 */
export function WhyKayan({ t }: { t: Record<string, string> }) {
  return (
    <SectionShell size="tall">
      <div id="why" className="mx-auto w-full max-w-[1400px]">
        <SectionHeading eyebrow="ليش كيان" title="خمسة أسباب تخليك ترتاح للطلب." />

        <ul>
          {/* No index needed any more: each point is triggered by its own
              position in the viewport rather than by a shared stagger delay. */}
          {WHY_KAYAN.map((item) => (
            <motion.li
              key={item.id}
              // Each point waits for its own turn in the viewport rather than
              // riding a shared stagger. Reading pace, not animation pace —
              // this section is asking to be trusted, and hurrying it works
              // against that.
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.85, ease: EASE.outQuart }}
              className="relative grid gap-3 border-t border-edge-strong py-8 md:grid-cols-[0.8fr_1.2fr] md:gap-10"
            >
              {/* The rule draws itself across before the words settle. */}
              <motion.span
                aria-hidden
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1, ease: EASE.outExpo }}
                className="absolute inset-x-0 top-0 h-px origin-right bg-brand-fill/40"
              />
              <motion.h3
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.7, ease: EASE.outQuart, delay: 0.12 }}
                className="text-lg text-body"
              >
                {t[`why.${item.id}.title`]}
              </motion.h3>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.7, ease: EASE.outQuart, delay: 0.2 }}
                className="max-w-[54ch] text-sm leading-[1.9] text-body-muted"
              >
                {t[`why.${item.id}.body`]}
              </motion.p>
            </motion.li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
