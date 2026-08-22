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
      // في المنتصف: العنوان يتوسّط القسم فيقرأ كعنوان رئيسي، لا سطراً في
      // الجنب. عمود متمركز بعرض محدود ليبقى السطر مقروءاً.
      className="mx-auto mb-14 flex max-w-[52ch] flex-col items-center text-center md:mb-20"
    >
      {/* السطر التعريفي شارة بخلفية خفيفة بلون العلامة، سميكة وواضحة، بلا
          تباعد حروف يقطّع العربية. */}
      <span className="mb-6 inline-flex items-center gap-2.5 rounded-full bg-brand-fill/10 px-5 py-2 text-sm font-semibold text-brand md:text-base">
        <span className="h-2 w-2 rounded-full bg-brand-fill" />
        {eyebrow}
      </span>

      {/* عنوان كبير متمركز، لكن بمقاس محترم لا يبتلع الشاشة. تباعد الأسطر
          فسيح لأن العربية بحروفها الهابطة وعلاماتها تتراكب مع تباعد ضيّق —
          والمقاس الأدنى صغير كفاية ليقرأ سطرين على الموبايل لا أربعة. */}
      <AnimatedText
        as="h2"
        text={title}
        className="font-display text-[clamp(1.9rem,3.5vw+1rem,3.25rem)] font-bold leading-[1.5] text-body [text-wrap:balance]"
      />

      {lead && (
        <p className="mt-7 max-w-[46ch] text-lg leading-[2] text-body-muted md:text-xl">{lead}</p>
      )}
    </motion.div>
  );
}
