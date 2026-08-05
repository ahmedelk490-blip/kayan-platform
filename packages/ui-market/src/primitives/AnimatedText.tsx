'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { cn } from '@erp/utils';

interface AnimatedTextProps {
  text: string;
  className?: string;
  /** Word-level is the accessible default; character-level for short display lines. */
  by?: 'word' | 'char';
  delay?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

/**
 * Progressive reveal.
 *
 * The full string stays in the accessibility tree as one label while the
 * visible fragments are hidden from it — otherwise screen readers announce
 * a headline one word at a time, which is how most implementations of this
 * effect quietly break.
 */
export function AnimatedText({
  text,
  className,
  by = 'word',
  delay = 0,
  as = 'span',
}: AnimatedTextProps) {
  const Tag = motion[as];
  const parts = by === 'word' ? text.split(' ') : Array.from(text);
  const stagger = by === 'word' ? 0.055 : 0.022;

  return (
    <Tag
      className={cn('inline-block', className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-12% 0px' }}
      variants={{ visible: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
      aria-label={text}
    >
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="inline-block overflow-hidden" aria-hidden="true">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: '110%', opacity: 0 },
              visible: { y: '0%', opacity: 1, transition: { duration: 0.85, ease: EASE.outExpo } },
            }}
          >
            {part}
            {by === 'word' && index < parts.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
