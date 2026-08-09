import { Decimal, dec, calc, type Numeric } from './money.ts';

/**
 * Invoicing, payments and receivables.
 *
 * Pure data and pure functions (Article 1).
 *
 * ── Three decisions the business has not made yet ───────────
 *
 * VAT rate, payment terms and whether numbering must be gapless are all
 * business facts nobody has supplied. None of them is invented here. They are
 * *settings* with documented defaults, so the module works today and the
 * manager sets the truth when they know it:
 *
 *   - the tax rate defaults to 0, which is visibly wrong rather than
 *     plausibly wrong. A hardcoded 14% would silently produce invoices with a
 *     number that looks right and might not be.
 *   - payment terms default to 0 days (due on issue), the most conservative
 *     reading of "we have not agreed terms".
 *   - numbering is gapless by default, because that is the tax-safe choice.
 *     Being gapless when the authority does not require it costs nothing;
 *     being sequential-with-holes when it does is a finding.
 */

// ── Status ──────────────────────────────────────────────────

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'VOID',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_AR: Record<InvoiceStatus, string> = {
  DRAFT: 'مسودة',
  ISSUED: 'صادرة',
  PARTIALLY_PAID: 'مدفوعة جزئياً',
  PAID: 'مدفوعة بالكامل',
  VOID: 'ملغاة',
};

/**
 * Allowed transitions.
 *
 * The two paid states are DERIVED from the payments, never typed — the same
 * rule purchasing follows for deliveries. An invoice that claims to be paid
 * without a payment record behind it is the beginning of a dispute.
 *
 * PAID is terminal. So is VOID: a cancelled fiscal document is never revived,
 * it is replaced by a new one, because its number has already been reported.
 */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['ISSUED', 'VOID'],
  ISSUED: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'VOID'],
  PAID: [],
  VOID: [],
};

/** Statuses that count towards what customers owe. */
export const RECEIVABLE_STATUSES: InvoiceStatus[] = ['ISSUED', 'PARTIALLY_PAID'];

// ── Payment methods ─────────────────────────────────────────

export const PAYMENT_METHODS = ['CASH', 'BANK', 'CHEQUE', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_AR: Record<PaymentMethod, string> = {
  CASH: 'نقداً',
  BANK: 'تحويل بنكي',
  CHEQUE: 'شيك',
  CARD: 'بطاقة',
  OTHER: 'أخرى',
};

// ── Money ───────────────────────────────────────────────────

/** What is still owed. Never negative — an overpayment is a credit, not a debt. */
export function balance(total: Numeric, paid: Numeric): Decimal {
  const left = dec(total).minus(dec(paid));
  return left.isNegative() ? dec(0) : calc(left);
}

/** Paid beyond the total. Surfaced separately so it cannot hide inside a zero. */
export function overpayment(total: Numeric, paid: Numeric): Decimal {
  const over = dec(paid).minus(dec(total));
  return over.isPositive() ? calc(over) : dec(0);
}

/** A payment may not exceed the outstanding balance. */
export function exceedsBalance(amount: Numeric, total: Numeric, paid: Numeric): boolean {
  return dec(amount).gt(balance(total, paid));
}

/**
 * The status an invoice should now hold, derived from its payments.
 *
 * DRAFT and VOID are returned untouched: a draft has no payments to speak of,
 * and a void invoice must never be resurrected by an incoming transfer.
 */
export function deriveInvoiceStatus(
  total: Numeric,
  paid: Numeric,
  current: InvoiceStatus,
): InvoiceStatus {
  if (current === 'DRAFT' || current === 'VOID') return current;
  if (dec(paid).lte(0)) return 'ISSUED';
  if (balance(total, paid).lte(0)) return 'PAID';
  return 'PARTIALLY_PAID';
}

/**
 * Due date from an issue date and a term in days.
 *
 * Zero days means due on issue, which is what "no agreed terms" should mean —
 * assuming thirty days of free credit on the customer's behalf is a decision
 * nobody made.
 */
export function dueDate(issuedAt: Date, termDays: number): Date {
  const due = new Date(issuedAt);
  due.setDate(due.getDate() + Math.max(0, Math.trunc(termDays)));
  return due;
}

/** Overdue is derived, never stored — it changes by the passing of time alone. */
export function isOverdue(
  due: Date | null | undefined,
  outstandingAmount: Numeric,
  now: Date = new Date(),
): boolean {
  if (!due) return false;
  if (dec(outstandingAmount).lte(0)) return false;
  return due.getTime() < now.getTime();
}

/** Whole days past due. Zero when not overdue. */
export function daysOverdue(
  due: Date | null | undefined,
  outstandingAmount: Numeric,
  now: Date = new Date(),
): number {
  if (!isOverdue(due, outstandingAmount, now)) return 0;
  return Math.floor((now.getTime() - due!.getTime()) / 86_400_000);
}

// ── Ageing ──────────────────────────────────────────────────

/** The buckets a collections conversation actually uses. */
export const AGEING_BUCKETS = ['CURRENT', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const AGEING_BUCKET_AR: Record<AgeingBucket, string> = {
  CURRENT: 'لم يحن موعدها',
  D1_30: '١–٣٠ يوم',
  D31_60: '٣١–٦٠ يوم',
  D61_90: '٦١–٩٠ يوم',
  D90_PLUS: 'أكثر من ٩٠ يوم',
};

export function ageingBucket(days: number): AgeingBucket {
  if (days <= 0) return 'CURRENT';
  if (days <= 30) return 'D1_30';
  if (days <= 60) return 'D31_60';
  if (days <= 90) return 'D61_90';
  return 'D90_PLUS';
}

export interface AgeingRow {
  dueDate: Date | null;
  outstanding: Numeric;
}

/** Total outstanding per ageing bucket. */
export function ageingTotals(
  rows: AgeingRow[],
  now: Date = new Date(),
): Record<AgeingBucket, Decimal> {
  const totals = Object.fromEntries(
    AGEING_BUCKETS.map((b) => [b, new Decimal(0)]),
  ) as Record<AgeingBucket, Decimal>;

  for (const row of rows) {
    const amount = dec(row.outstanding);
    if (amount.lte(0)) continue;
    const bucket = ageingBucket(daysOverdue(row.dueDate, amount, now));
    totals[bucket] = calc(totals[bucket].plus(amount));
  }

  return totals;
}

// ── Guards ──────────────────────────────────────────────────

export function isInvoiceStatus(v: string): v is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(v);
}

export function isPaymentMethod(v: string): v is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(v);
}
