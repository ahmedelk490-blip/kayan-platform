'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { VISION } from '@/site';

/**
 * الرؤية والرسالة والقيم، وتنتهي بشعار العلامة.
 *
 * Motion grammar: two large panels scale up from 0.96 while the values below
 * enter as a short stagger — a settling movement rather than an arriving one,
 * because this is the calm before the closing line.
 */
export function Vision() {
  return (
    <SectionShell id="vision" label="الرؤية والرسالة والقيم" size="tall" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="grid gap-6 md:grid-cols-2">
          {[VISION.vision, VISION.mission].map((block, index) => (
            <motion.div
              key={block.title}
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.9, ease: EASE.outExpo, delay: index * 0.12 }}
              className={
                index === 0
                  ? 'rounded-2xl border border-primary-600/40 bg-primary-950/40 p-9 md:p-11'
                  : 'rounded-2xl border border-ink-800 bg-ink-900/40 p-9 md:p-11'
              }
            >
              <h3 className="font-display text-2xl text-accent">{block.title}</h3>
              <p className="mt-5 text-base leading-loose text-neutral-300">{block.body}</p>
            </motion.div>
          ))}
        </div>

        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: EASE.outExpo }}
          className="mb-8 mt-16 font-display text-xl text-neutral-100"
        >
          {VISION.values.title}
        </motion.h3>

        <ul className="grid gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-2 lg:grid-cols-4">
          {VISION.values.items.map((value, index) => (
            <motion.li
              key={value.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.6, ease: EASE.outExpo, delay: index * 0.08 }}
              className="bg-ink-950 p-7"
            >
              <h4 className="font-display text-lg text-neutral-100">{value.name}</h4>
              <p className="mt-2.5 text-sm leading-loose text-neutral-400">{value.body}</p>
            </motion.li>
          ))}
        </ul>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 1, ease: EASE.outExpo, delay: 0.2 }}
          className="mt-20 text-center font-display text-display-3 leading-[1.4] text-neutral-100"
        >
          كيان<span className="text-accent">…</span> لأن كل علامة ناجحة
          <span className="block text-accent">تبدأ بكيان</span>
        </motion.p>
      </div>
    </SectionShell>
  );
}
