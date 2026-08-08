import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * Types and helpers a `'use server'` module cannot hold.
 *
 * A file marked `'use server'` may only export async functions, so the form
 * state type and the numbering helper live here — the same split the sales
 * module uses.
 */

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Next production order number, scoped to tenant and year: MO-2026-0001.
 *
 * Derived from the highest existing number rather than a counter table. Not
 * gapless — DI-6 requires that only for fiscal documents, and a production
 * order is an internal work instruction, not one.
 */
export async function nextProductionNumber(tenantId: string): Promise<string> {
  const prefix = `MO-${new Date().getFullYear()}-`;
  const rows = await prisma.productionOrder.findMany({
    where: { tenantId, number: { startsWith: prefix } },
    select: { number: true },
  });
  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.number.slice(prefix.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** Format a Date for a `<input type="date">` default value. */
export function dateInput(value: Date | null | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}
