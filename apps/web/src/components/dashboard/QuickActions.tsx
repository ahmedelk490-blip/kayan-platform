'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { IconArrow } from './Icons';

export interface QuickAction {
  href: string;
  label: string;
  description: string;
  available: boolean;
}

/**
 * إجراءات سريعة.
 *
 * Unavailable actions render as inert text, not disabled links — a link that
 * looks clickable and goes to a 404 is worse than one that plainly is not
 * there yet.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <ul className="grid gap-2.5">
      {actions.map((action, index) => (
        <motion.li
          key={action.href}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + index * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {action.available ? (
            <Link
              href={action.href}
              className="group flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-4 py-3 transition-all duration-300 hover:border-primary-600 hover:bg-primary-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>
                <span className="block text-sm text-neutral-200">{action.label}</span>
                <span className="block text-[0.7rem] text-neutral-500">{action.description}</span>
              </span>
              <IconArrow className="h-4 w-4 shrink-0 text-neutral-600 transition-all duration-300 group-hover:-translate-x-1 group-hover:text-accent" />
            </Link>
          ) : (
            <div className="rounded-lg border border-dashed border-ink-800 px-4 py-3 opacity-55">
              <span className="block text-sm text-neutral-500">{action.label}</span>
              <span className="block text-[0.7rem] text-neutral-600">{action.description}</span>
            </div>
          )}
        </motion.li>
      ))}
    </ul>
  );
}
