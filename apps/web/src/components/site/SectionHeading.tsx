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
      {/* السطر التعريفي في سطر مستقلّ فوق العنوان: شارة بخلفية خفيفة بلون
          العلامة، سميكة وواضحة، بلا تباعد حروف يقطّع العربية. */}
      <span className="mb-5 inline-flex items-center gap-2.5 rounded-full bg-brand-fill/10 px-4 py-1.5 text-sm font-semibold text-brand md:text-base">
        <span className="h-2 w-2 rounded-full bg-brand-fill" />
        {eyebrow}
      </span>

      {/* العنوان ضخم: أكبر من مقاس القسم القياسي ليقرأ كعنوان رئيسي واضح
          على الموبايل والكمبيوتر. وزن ثقيل وتباين عالٍ. */}
      <AnimatedText
        as="h2"
        text={title}
        className="font-display text-[clamp(2.3rem,5.5vw,4rem)] font-bold leading-[1.12] text-body"
      />

      {lead && (
        <p className="mt-6 text-lg leading-[1.95] text-body-muted md:text-xl">{lead}</p>
      )}
    </motion.div>
  );
}
