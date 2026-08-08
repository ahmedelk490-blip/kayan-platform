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

/**
 * Icon tint only. No glows, no gradients — on a white operational surface
 * they add nothing and cost legibility.
 */
const TONES = {
  primary: { chip: 'bg-brand-soft text-brand' },
  neutral: { chip: 'bg-card-2 text-txt-3' },
  success: { chip: 'bg-ok-soft text-ok' },
  warning: { chip: 'bg-warn-soft text-warn' },
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
      className="erp-card erp-card-hover p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-txt-3">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
          {icon}
        </span>
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-brand">
          <CountUp value={value} decimals={decimals} />
        </span>
        {unit && <span className="text-xs text-txt-3">{unit}</span>}
      </p>

      {hint && <p className="mt-1.5 text-[0.7rem] text-txt-4">{hint}</p>}
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
      // Full opacity, unlike the dark theme's faded treatment: dimmed grey
      // text on white fails contrast. The dashed border and the badge carry
      // the "not built" meaning instead.
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-xl border border-dashed border-line-2 bg-card-2 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-txt-3">{label}</p>
        <span className="shrink-0 text-txt-4">{icon}</span>
      </div>

      <p className="mt-3 text-2xl text-txt-4" aria-label="لا توجد بيانات">
        —
      </p>

      <p className="mt-1.5 text-[0.7rem] leading-relaxed text-txt-4">{reason}</p>

      <span className="mt-3 inline-block rounded-full border border-line-2 px-2.5 py-0.5 text-[0.65rem] text-txt-4">
        في انتظار تفعيل الموديول
      </span>
    </motion.div>
  );
}
