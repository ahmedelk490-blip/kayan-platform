'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { cn } from '@erp/utils';

interface SectionShellProps {
  children: ReactNode;
  id?: string;
  className?: string;
  /** Story act, surfaced as an eyebrow label. */
  act?: string;
  label?: string;
  /** Vertical rhythm. `tall` for set pieces, `base` for supporting beats. */
  size?: 'base' | 'tall';
}

/**
 * Shared section chrome: spacing rhythm, entrance, and the act label.
 *
 * Deliberately carries no layout opinion beyond padding — every section owns
 * a distinct composition, and a shell that imposed a grid would flatten them
 * into the repeated layouts the directive forbids.
 */
export function SectionShell({
  children,
  id,
  className,
  act,
  label,
  size = 'base',
}: SectionShellProps) {
  // إيقاع رأسيّ مضمون: صفوف padding مكتوبة inline لأن أصناف Tailwind
  // (py-32/py-48) تُولَّد من مسح ملفات التطبيق لا حزمة ui-market، فكانت لا
  // تُطبَّق — القسمان يتلامسان بلا فاصل. clamp يعطي فاصلاً متجاوباً بلا media.
  const padY = size === 'tall' ? 'clamp(5rem, 12vw, 10rem)' : 'clamp(3.5rem, 9vw, 7rem)';

  return (
    <section
      id={id}
      className={cn('relative w-full px-6 md:px-10 lg:px-16', className)}
      style={{ paddingTop: padY, paddingBottom: padY }}
    >
      {(act || label) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.6, ease: EASE.outExpo }}
          className="mb-10 flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-neutral-400"
        >
          {act && <span className="text-accent">{act}</span>}
          {act && label && <span className="h-px w-8 bg-ink-700" />}
          {label && <span>{label}</span>}
        </motion.div>
      )}
      {children}
    </section>
  );
}
