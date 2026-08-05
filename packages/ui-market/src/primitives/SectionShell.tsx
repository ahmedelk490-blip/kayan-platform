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
  return (
    <section
      id={id}
      className={cn(
        'relative w-full px-6 md:px-10 lg:px-16',
        size === 'tall' ? 'py-32 md:py-48' : 'py-24 md:py-32',
        className,
      )}
    >
      {(act || label) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.6, ease: EASE.outExpo }}
          className="mb-10 flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-steel-400"
        >
          {act && <span className="text-accent">{act}</span>}
          {act && label && <span className="h-px w-8 bg-steel-700" />}
          {label && <span>{label}</span>}
        </motion.div>
      )}
      {children}
    </section>
  );
}
