import 'server-only';

import { prisma } from './prisma';

/**
 * Shared plumbing for the operations modules — expenses, damage, penalties.
 *
 * Lives outside the `'use server'` files because those may only export async
 * functions, and a form-state type is not one.
 */

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

type Numbered = 'secondaryExpense' | 'damageRecord' | 'penalty';

/**
 * Next document number, scoped to tenant and year: EXP-2026-0001.
 *
 * Derived from the highest existing number rather than a counter table, so
 * it cannot drift out of step with reality. Not gapless — DI-6 requires that
 * only for fiscal documents, and none of these are.
 */
export async function nextOpsNumber(
  model: Numbered,
  prefix: string,
  tenantId: string,
): Promise<string> {
  const stem = `${prefix}-${new Date().getFullYear()}-`;
  const where = { tenantId, number: { startsWith: stem } };
  const select = { number: true } as const;

  const rows =
    model === 'secondaryExpense'
      ? await prisma.secondaryExpense.findMany({ where, select })
      : model === 'damageRecord'
        ? await prisma.damageRecord.findMany({ where, select })
        : await prisma.penalty.findMany({ where, select });

  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.number.slice(stem.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);

  return `${stem}${String(max + 1).padStart(4, '0')}`;
}

/** Parse a date input, falling back to today rather than to null. */
export function parseDateOr(value: string | null | undefined, fallback = new Date()): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Format a Date for an `<input type="date">`. */
export function dateInput(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

/** First and last instant of a YYYY-MM month string, defaulting to now. */
export function monthRange(month?: string): { from: Date; to: Date; key: string } {
  const now = new Date();
  const [y, m] = (month ?? '').split('-').map((v) => Number.parseInt(v, 10));
  const year = Number.isFinite(y) ? y : now.getFullYear();
  const monthIndex = Number.isFinite(m) ? m - 1 : now.getMonth();

  const from = new Date(year, monthIndex, 1);
  // Day 0 of the next month is the last day of this one — avoids the
  // 28/29/30/31 problem entirely.
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return { from, to, key: `${year}-${String(monthIndex + 1).padStart(2, '0')}` };
}
