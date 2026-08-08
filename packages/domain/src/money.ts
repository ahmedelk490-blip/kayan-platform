import Decimal from 'decimal.js';

/**
 * Exact decimal arithmetic for money and quantities.
 *
 * decimal.js is a pure maths library — no I/O, no framework — so it is
 * allowed inside the domain layer (Article 1). Prisma bundles the same
 * library, so `Prisma.Decimal` values pass straight into these helpers
 * without conversion.
 *
 * WHY THIS EXISTS
 * Phase 4 computes line totals, tax and document roll-ups. In IEEE-754
 * doubles, 0.1 + 0.2 is 0.30000000000000004, and 1000 invoice lines
 * accumulate that error into a figure nobody can reconcile. Every
 * calculation below is exact.
 */

// 28 significant digits is decimal.js's default and is far beyond any
// realistic money value; ROUND_HALF_UP matches accounting convention and
// what a person does by hand.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/** Anything that can stand in for a decimal: a Decimal, a number, a string. */
export type Numeric = Decimal | number | string | { toString(): string };

/** Coerce to Decimal. Null, undefined and unparseable values become zero. */
export function dec(value: Numeric | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  try {
    return new Decimal(typeof value === 'object' ? value.toString() : value);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Internal working scale. Four places, because a unit price of 12.3456 is
 * legitimate for a metre of fabric or a gram of thread.
 */
export const CALC_SCALE = 4;

/** Display scale — what appears on a document. */
export const DISPLAY_SCALE = 2;

/** Round to the internal working scale. */
export function calc(value: Numeric | null | undefined): Decimal {
  return dec(value).toDecimalPlaces(CALC_SCALE, Decimal.ROUND_HALF_UP);
}

/** Round to the display scale — apply once, at the end, never mid-chain. */
export function display(value: Numeric | null | undefined): Decimal {
  return dec(value).toDecimalPlaces(DISPLAY_SCALE, Decimal.ROUND_HALF_UP);
}

/** Format for the UI: fixed 2 places, Western digits for column alignment. */
export function formatMoney(value: Numeric | null | undefined): string {
  return display(value).toFixed(DISPLAY_SCALE);
}

/** Quantities print without forced decimals — "25", not "25.00". */
export function formatQty(value: Numeric | null | undefined): string {
  const d = calc(value);
  return d.isInteger() ? d.toFixed(0) : d.toString();
}

/** Convert to the plain number Prisma accepts on write. */
export function toNumber(value: Numeric | null | undefined): number {
  return dec(value).toNumber();
}

export function isZero(value: Numeric | null | undefined): boolean {
  return dec(value).isZero();
}
