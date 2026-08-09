'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { WHY_KAYAN } from '@/site';

/**
 * ليش كيان.
 *
 * قائمة تُرسم خطوطها أفقياً سطراً بعد سطر — إيقاع مختلف عن البطاقات، وأقرب
 * لقراءة قائمة أسباب.
 */
export function WhyKayan() {
  return (
    <SectionShell size="tall">
      <div id="why" className="mx-auto w-full max-w-[1400px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: EASE.outExpo }}
          className="mb-14 max-w-[52ch]"
        >
          <span className="mb-5 flex items-center gap-3 text-xs tracking-[0.16em] text-neutral-400">
            <span className="h-px w-10 bg-accent" />
            ليش كيان
          </span>
          <h2 className="font-display text-display-3 leading-[1.2] text-neutral-100">
            خمسة أسباب تخليك ترتاح للطلب.
          </h2>
        </motion.div>

        <ul>
          {WHY_KAYAN.map((item, index) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.7, ease: EASE.outExpo, delay: index * 0.07 }}
              className="relative grid gap-3 border-t border-ink-700 py-8 md:grid-cols-[0.8fr_1.2fr] md:gap-10"
            >
              <motion.span
                aria-hidden
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: EASE.outExpo, delay: index * 0.07 }}
                className="absolute inset-x-0 top-0 h-px origin-right bg-accent/40"
              />
              <h3 className="text-lg text-neutral-100">{item.title}</h3>
              <p className="max-w-[54ch] text-sm leading-[1.9] text-neutral-400">{item.body}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
