'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { CountUp } from './CountUp';

/**
 * بطاقة إحصائية.
 *
 * Two variants, and the distinction is the point:
 *   `live`    — a real count from the database
 *   `pending` — a module that does not exist; shows a dash and says so
 *
 * There is no third variant, because a card that *looks* live but shows an
 * invented number is the failure mode this whole design is guarding against.
 */

const TONES = {
  primary: { ring: 'ring-primary-600/30', glow: 'bg-primary-600/20', text: 'text-accent' },
  neutral: { ring: 'ring-ink-700', glow: 'bg-ink-700/40', text: 'text-neutral-300' },
  success: { ring: 'ring-success-600/30', glow: 'bg-success-600/20', text: 'text-success-500' },
  warning: { ring: 'ring-warning-600/30', glow: 'bg-warning-600/20', text: 'text-warning-500' },
} as const;

export type Tone = keyof typeof TONES;

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'primary',
  decimals = 0,
  index = 0,
}: {
  label: string;
  value: number;
  unit?: string;
  hint?: string;
  icon: ReactNode;
  tone?: Tone;
  decimals?: number;
  index?: number;
}) {
  const t = TONES[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className={`group relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/50 p-5 ring-1 ring-inset ${t.ring} transition-shadow duration-300 hover:shadow-lg hover:shadow-black/40`}
    >
      {/* توهج خفيف يظهر عند المرور فقط */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -end-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-500 ${t.glow} opacity-0 group-hover:opacity-100`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs text-neutral-500">{label}</p>
        <span className={`shrink-0 ${t.text}`}>{icon}</span>
      </div>

      <p className="relative mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl text-neutral-100">
          <CountUp value={value} decimals={decimals} />
        </span>
        {unit && <span className="text-xs text-neutral-500">{unit}</span>}
      </p>

      {hint && <p className="relative mt-1.5 text-[0.7rem] text-neutral-600">{hint}</p>}
    </motion.div>
  );
}

export function PendingCard({
  label,
  reason,
  icon,
  index = 0,
}: {
  label: string;
  reason: string;
  icon: ReactNode;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 0.62, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-xl border border-dashed border-ink-700 bg-ink-900/25 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-neutral-500">{label}</p>
        <span className="shrink-0 text-neutral-700">{icon}</span>
      </div>

      <p className="mt-3 text-2xl text-neutral-700" aria-label="لا توجد بيانات">
        —
      </p>

      <p className="mt-1.5 text-[0.7rem] leading-relaxed text-neutral-600">{reason}</p>

      <span className="mt-3 inline-block rounded-full border border-ink-700 px-2.5 py-0.5 text-[0.65rem] text-neutral-600">
        في انتظار تفعيل الموديول
      </span>
    </motion.div>
  );
}
