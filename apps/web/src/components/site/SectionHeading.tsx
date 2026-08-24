'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';

/**
 * رأس قسم موحّد — كبير، احترافيّ، محاذى للبداية.
 *
 * بطلب المالك: العنوان ضخمٌ ومحاذٍ للبداية (لا في المنتصف)، بحروف متّصلة بلا
 * تباعد يكسر العربية، والشارة النبيتيّة أكبر وواضحة على الموبايل. قسم واحد
 * يُغيَّر فتتغيّر كل الأقسام معاً.
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
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, ease: EASE.outExpo }}
      className="mb-12 flex flex-col items-start text-start md:mb-20"
    >
      {/* الشارة النبيتيّة: أكبر وأوضح، تظهر جيداً على الموبايل. */}
      <span className="mb-6 inline-flex items-center gap-2.5 rounded-full bg-brand-fill/15 px-5 py-2.5 text-base font-bold text-brand shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-brand-fill)_30%,transparent)] md:text-lg">
        <span className="h-2.5 w-2.5 rounded-full bg-brand-fill" />
        {eyebrow}
      </span>

      {/* عنوان ضخم احترافيّ. الحروف متّصلة (letter-spacing طبيعيّ) والكلمة لا
          تُكسر في منتصفها؛ عرضٌ محدود بالحروف يضبط عدد الأسطر دون بعثرة. */}
      <h2
        className="font-display font-bold text-body"
        style={{
          fontSize: 'clamp(2.4rem, 7vw, 4.5rem)',
          lineHeight: 1.14,
          letterSpacing: 'normal',
          wordSpacing: 'normal',
          overflowWrap: 'normal',
          wordBreak: 'normal',
          maxWidth: '20ch',
          textWrap: 'balance',
        }}
      >
        {title}
      </h2>

      {lead && (
        <p className="mt-6 max-w-[54ch] text-lg leading-[2] text-body-muted md:text-xl">{lead}</p>
      )}
    </motion.div>
  );
}
