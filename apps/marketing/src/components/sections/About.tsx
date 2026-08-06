'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';

/**
 * من نحن — the brand's opening argument.
 *
 * Motion: a single measured reveal. This section carries the idea the whole
 * page rests on, so it is deliberately calmer than the Hero above it.
 */

const PARAGRAPHS = [
  'في كيان نؤمن أن الزي الموحد ليس مجرد ملابس، بل جزء من هوية كل علامة تجارية ناجحة، وانعكاس مباشر لاحترافية الشركة أمام عملائها.',
  'نتخصص في تصنيع وتوريد الملابس الموحدة، وتقديم خدمات الطباعة والتطريز الاحترافي بأعلى معايير الجودة — من اختيار الخامة، إلى القَصّة، إلى الغرزة الأخيرة في شعارك.',
  'كل قطعة تخرج من كيان تحمل اسم عميلنا قبل أن تحمل اسمنا. ولهذا نعاملها على هذا الأساس.',
];

export function About() {
  return (
    <SectionShell id="about" label="من نحن" size="tall" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.9, ease: EASE.outExpo }}
            className="font-display text-display-3 leading-[1.3] text-neutral-100"
          >
            الزي الموحد
            <span className="block text-accent">هوية تُرتدى</span>
          </motion.h2>

          <div className="space-y-6">
            {PARAGRAPHS.map((text, index) => (
              <motion.p
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.8, ease: EASE.outExpo, delay: index * 0.12 }}
                className="text-base leading-loose text-neutral-400 md:text-lg"
              >
                {text}
              </motion.p>
            ))}

            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              whileInView={{ opacity: 1, scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: EASE.outExpo, delay: 0.4 }}
              className="rule-hairline origin-right !mt-10"
            />

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.55 }}
              className="font-display text-lg text-accent md:text-xl"
            >
              خامات ممتازة · ستايلات عصرية · تطريز وطباعة
            </motion.p>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
