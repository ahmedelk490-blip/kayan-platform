'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** عنوان قسم مع خط رفيع يمتد عند الظهور. */
export function SectionTitle({
  children,
  note,
  delay = 0,
}: {
  children: ReactNode;
  note?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.5 }}
      className="mb-3 flex items-center gap-3"
    >
      <h3 className="shrink-0 text-xs text-neutral-400">{children}</h3>
      {note && <span className="shrink-0 text-[0.7rem] text-neutral-600">{note}</span>}
      <motion.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: delay + 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="h-px flex-1 origin-right bg-ink-800"
      />
    </motion.div>
  );
}

/** لوح محتوى بحركة دخول واحدة. */
export function Panel({
  title,
  children,
  delay = 0,
  action,
}: {
  title: string;
  children: ReactNode;
  delay?: number;
  action?: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40"
    >
      <header className="flex items-center justify-between gap-3 border-b border-ink-800 px-5 py-3.5">
        <h3 className="text-sm text-neutral-200">{title}</h3>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </motion.section>
  );
}
