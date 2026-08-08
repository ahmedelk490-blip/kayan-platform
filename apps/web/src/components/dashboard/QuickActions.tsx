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
              className="group flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 transition-all duration-300 hover:border-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span>
                <span className="block text-sm text-txt">{action.label}</span>
                <span className="block text-[0.7rem] text-txt-3">{action.description}</span>
              </span>
              <IconArrow className="h-4 w-4 shrink-0 text-txt-4 transition-all duration-300 group-hover:-translate-x-1 group-hover:text-brand" />
            </Link>
          ) : (
            <div className="rounded-lg border border-dashed border-line px-4 py-3 opacity-55">
              <span className="block text-sm text-txt-3">{action.label}</span>
              <span className="block text-[0.7rem] text-txt-4">{action.description}</span>
            </div>
          )}
        </motion.li>
      ))}
    </ul>
  );
}
