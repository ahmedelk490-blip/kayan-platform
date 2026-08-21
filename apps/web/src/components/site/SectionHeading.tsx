'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { AnimatedText } from '@erp/ui-market';

/**
 * رأس قسم موحّد — كبير وواضح.
 *
 * كانت الرؤوس ثلاثة نسخ متطابقة بعنوان صغير باهت (text-xs، muted) لا يُقرأ
 * كعنوان، وفوقه سطر تعريفي بتباعد حروف — والتباعد يقطّع العربية. صار رأساً
 * واحداً: سطرٌ تعريفيّ بلون العلامة وبلا تباعد يكسر الوصل، وعنوانٌ ضخم عالي
 * التباين. قسم واحد يُغيَّر فيتغيّر الثلاثة معاً.
 */
export function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, ease: EASE.outExpo }}
      className="mb-12 max-w-[56ch] md:mb-16"
    >
      {/* السطر التعريفي: بلون العلامة، سميك، بلا تباعد حروف — التباعد على
          العربية يفصل الحروف الموصولة. الشريط أثخن وملوّن ليُرى. */}
      <span className="mb-4 inline-flex items-center gap-3 text-sm font-semibold text-brand md:text-base">
        <span className="h-[3px] w-9 rounded-full bg-brand-fill" />
        {eyebrow}
      </span>

      <AnimatedText
        as="h2"
        text={title}
        className="font-display text-display-3 font-semibold leading-[1.15] text-body"
      />

      {lead && (
        <p className="mt-5 text-lg leading-[1.9] text-body-muted">{lead}</p>
      )}
    </motion.div>
  );
}
