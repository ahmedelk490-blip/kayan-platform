'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { cn } from '@erp/utils';

interface AnimatedTextProps {
  text: string;
  className?: string;
  /**
   * محفوظة للتوافق مع النداءات القائمة، ولم تعد تقسّم النص. العربية خطّ
   * متّصل: تقسيمها إلى كلمات — فضلاً عن حروف — يكسر الوصلات ويجعل العنوان
   * يبدو مقطّعاً، وهو ما رفضه المالك صراحةً.
   */
  by?: 'word' | 'char';
  delay?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

/**
 * كشف تدريجي للنص، كتلةً واحدة متّصلة.
 *
 * كان يقسّم النص إلى كلمات، كلٌّ في صندوق `overflow-hidden` يصعد على حدة.
 * ذلك يعمل مع اللاتينية المنفصلة أصلاً، ويكسر العربية: الحروف تتّصل داخل
 * الكلمة، فتقطيعها إلى صناديق متجاورة يُظهر العنوان مبعثراً، والقصّ يبتر
 * أطراف الحروف الهابطة.
 *
 * السطر الآن يظهر كاملاً بحركة واحدة — شفافية وارتفاع خفيف — فيبقى الخطّ
 * متّصلاً كما يُكتب. النصّ حقيقيّ في الشجرة لا وسمَ بديلاً، فالقارئ الصوتي
 * يقرؤه مرّة واحدة سليماً.
 */
export function AnimatedText({ text, className, delay = 0, as = 'span' }: AnimatedTextProps) {
  const Tag = motion[as];

  return (
    <Tag
      className={cn('inline-block', className)}
      initial={{ opacity: 0, y: '0.45em' }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.8, ease: EASE.outExpo, delay }}
    >
      {text}
    </Tag>
  );
}
