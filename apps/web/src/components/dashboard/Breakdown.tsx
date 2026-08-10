'use client';

import { motion } from 'motion/react';

/**
 * توزيع حسب الحالة.
 *
 * A status with no records shows a zero in muted type rather than being
 * omitted. Dropping empty statuses would make the list change shape as data
 * arrives, and "no orders are in QC" is itself worth knowing — a missing row
 * reads as a missing feature.
 */
export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  /** Secondary figure — a quantity or a value. */
  detail?: string;
}

export function Breakdown({
  rows,
  emptyNote,
  delay = 0,
}: {
  rows: BreakdownRow[];
  emptyNote: string;
  delay?: number;
}) {
  const anything = rows.some((r) => r.count > 0);

  if (!anything) {
    return (
      <p className="rounded-lg border border-dashed border-line p-4 text-xs leading-relaxed text-txt-3">
        {emptyNote}
      </p>
    );
  }

  const peak = Math.max(1, ...rows.map((r) => r.count));

  return (
    <ul className="space-y-2.5">
      {rows.map((row, index) => (
        <li key={row.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
          <span className={`text-xs ${row.count > 0 ? 'text-txt-2' : 'text-txt-4'}`}>
            {row.label}
          </span>

          <span className="h-1.5 overflow-hidden rounded-full bg-card-2">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: row.count / peak }}
              transition={{ duration: 0.7, delay: delay + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
              // Scale rather than width: a transform cannot trigger layout.
              className="block h-full origin-right rounded-full bg-brand"
            />
          </span>

          <span className="tnum text-end text-xs">
            <span className={row.count > 0 ? 'font-medium text-txt' : 'text-txt-4'}>
              {row.count}
            </span>
            {row.detail && <span className="ms-2 text-[0.7rem] text-txt-4">{row.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * سطر مؤشر بسيط داخل لوحة.
 *
 * `unknown` is a real state, distinct from zero: it means the figure exists
 * but nothing has produced it yet, and the dash says so.
 */
export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | null;
  hint?: string;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <div>
        <p className="text-xs text-txt-2">{label}</p>
        {hint && <p className="mt-0.5 text-[0.7rem] text-txt-4">{hint}</p>}
      </div>
      <p
        className={`tnum shrink-0 text-sm font-medium ${
          value === null
            ? 'text-txt-4'
            : tone === 'bad'
              ? 'text-bad'
              : tone === 'warn'
                ? 'text-warn'
                : tone === 'ok'
                  ? 'text-ok'
                  : 'text-brand'
        }`}
      >
        {value ?? '—'}
      </p>
    </div>
  );
}
