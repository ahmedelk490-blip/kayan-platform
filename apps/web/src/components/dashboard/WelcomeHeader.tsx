'use client';

import { motion } from 'motion/react';

/**
 * ترويسة الترحيب.
 *
 * The date is formatted on the client to avoid a hydration mismatch: the
 * server renders in its own timezone, the browser in the user's, and Arabic
 * date strings differ between them.
 */
export function WelcomeHeader({ name, roleAr }: { name: string; roleAr: string }) {
  const now = new Date();

  const greeting =
    now.getHours() < 12 ? 'صباح الخير' : now.getHours() < 17 ? 'مساء الخير' : 'مساء الخير';

  const dateAr = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-xl border border-ink-800 bg-gradient-to-bl from-primary-950/60 via-ink-900/50 to-ink-900/30 p-6 md:p-7"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-primary-600/10 blur-3xl"
      />

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="text-xs text-accent"
          >
            {greeting}
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-1.5 text-2xl text-neutral-100 md:text-3xl"
          >
            {name}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.32, duration: 0.5 }}
            className="mt-1.5 text-xs text-neutral-500"
          >
            {roleAr}
          </motion.p>
        </div>

        <motion.p
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.38, duration: 0.5 }}
          className="text-xs text-neutral-500"
        >
          {dateAr}
        </motion.p>
      </div>
    </motion.header>
  );
}
