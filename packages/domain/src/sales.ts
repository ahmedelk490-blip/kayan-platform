/**
 * Sales document arithmetic and status rules.
 *
 * Pure functions — no database, no framework (Article 1). The same maths
 * runs for quotations and orders, so a converted order can never disagree
 * with the quotation it came from.
 *
 * ⚠ Floats. SQLite has no DECIMAL, so money is stored as Float for now
 * (documented in the schema header). Rounding is applied at the documented
 * points below to keep totals stable; when Postgres arrives these become
 * NUMERIC(19,4) and the rounding calls come out.
 */

/** Two decimal places, the smallest unit of EGP that appears on a document. */
export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface LineInput {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  discountPercent?: number;
  taxRate?: number;
}

export interface LineTotals {
  gross: number;
  discount: number;
  net: number;
  taxAmount: number;
  lineTotal: number;
}

/**
 * One line.
 *
 * Percentage discount applies to the gross first, then any fixed amount is
 * subtracted. Tax is charged on the discounted net, never on the gross —
 * charging tax before discount overstates every invoice.
 */
export function calcLine(input: LineInput): LineTotals {
  const gross = money(input.quantity * input.unitPrice);
  const percentPart = money(gross * ((input.discountPercent ?? 0) / 100));
  const discount = money(Math.min(gross, percentPart + (input.discountAmount ?? 0)));
  const net = money(gross - discount);
  const taxAmount = money(net * ((input.taxRate ?? 0) / 100));
  return { gross, discount, net, taxAmount, lineTotal: money(net + taxAmount) };
}

export interface DocumentTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

/**
 * Whole document.
 *
 * `subtotal` is the sum of line nets — after line discounts, before tax.
 * A document-level discount then applies on top, which is how a
 * "5% off the whole order" concession is actually granted.
 */
export function calcDocument(
  lines: LineTotals[],
  doc: { discountAmount?: number; discountPercent?: number } = {},
): DocumentTotals {
  const subtotal = money(lines.reduce((sum, l) => sum + l.net, 0));
  const lineTax = money(lines.reduce((sum, l) => sum + l.taxAmount, 0));
  const percentPart = money(subtotal * ((doc.discountPercent ?? 0) / 100));
  const discountAmount = money(Math.min(subtotal, percentPart + (doc.discountAmount ?? 0)));
  return {
    subtotal,
    discountAmount,
    taxAmount: lineTax,
    total: money(subtotal - discountAmount + lineTax),
  };
}

// ── Status rules ────────────────────────────────────────────

export const QUOTATION_STATUSES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_AR: Record<QuotationStatus, string> = {
  DRAFT: 'مسودة',
  SENT: 'مُرسل',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  EXPIRED: 'منتهي',
  CONVERTED: 'محوَّل',
};

/**
 * Allowed transitions.
 *
 * CONVERTED is terminal and reachable only from ACCEPTED — that is the rule
 * that stops one quotation becoming two orders.
 */
export const QUOTATION_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['SENT', 'REJECTED', 'EXPIRED'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: ['CONVERTED', 'REJECTED', 'EXPIRED'],
  REJECTED: ['DRAFT'],
  EXPIRED: ['DRAFT'],
  CONVERTED: [],
};

export const ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_AR: Record<OrderStatus, string> = {
  DRAFT: 'مسودة',
  CONFIRMED: 'مؤكَّد',
  IN_PRODUCTION: 'قيد الإنتاج',
  READY: 'جاهز',
  DELIVERED: 'مُسلَّم',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'READY', 'CANCELLED'],
  IN_PRODUCTION: ['READY', 'CANCELLED'],
  READY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition<S extends string>(
  map: Record<S, S[]>,
  from: S,
  to: S,
): boolean {
  return (map[from] ?? []).includes(to);
}

/** Statuses that hold stock reserved. */
export const RESERVING_STATUSES: OrderStatus[] = [
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
];

/** Available to promise — what a salesperson may actually sell. */
export function available(onHand: number, reserved: number): number {
  return money(onHand - reserved);
}

export function isQuotationStatus(v: string): v is QuotationStatus {
  return (QUOTATION_STATUSES as readonly string[]).includes(v);
}

export function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v);
}
