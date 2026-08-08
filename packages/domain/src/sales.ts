import { Decimal, dec, calc, display, type Numeric } from './money.ts';

/**
 * Sales document arithmetic and status rules.
 *
 * Pure functions — no database, no framework (Article 1). The same maths
 * runs for quotations and orders, so a converted order can never disagree
 * with the quotation it came from.
 *
 * Phase 4.5: every calculation is exact decimal. Values arrive as
 * Prisma.Decimal, number or string and are coerced; results are Decimal.
 * Rounding happens at two documented points only — line net and line tax —
 * never mid-chain, so errors cannot compound across a document.
 */

export { Decimal, dec, calc, display };

/** Round to the display scale. Kept for call sites that want a number. */
export function money(value: Numeric | null | undefined): number {
  return display(value).toNumber();
}

export interface LineInput {
  quantity: Numeric;
  unitPrice: Numeric;
  discountAmount?: Numeric;
  discountPercent?: Numeric;
  taxRate?: Numeric;
}

export interface LineTotals {
  gross: Decimal;
  discount: Decimal;
  net: Decimal;
  taxAmount: Decimal;
  lineTotal: Decimal;
}

/**
 * One line.
 *
 * Percentage discount applies to the gross first, then any fixed amount is
 * subtracted. Tax is charged on the discounted net, never on the gross —
 * charging tax before discount overstates every invoice.
 *
 * Discount is clamped at the gross so a line can never go negative.
 */
export function calcLine(input: LineInput): LineTotals {
  const gross = calc(dec(input.quantity).times(dec(input.unitPrice)));

  const percentPart = gross.times(dec(input.discountPercent).dividedBy(100));
  const rawDiscount = percentPart.plus(dec(input.discountAmount));
  const discount = calc(Decimal.min(gross, rawDiscount));

  const net = calc(gross.minus(discount));
  const taxAmount = calc(net.times(dec(input.taxRate).dividedBy(100)));

  return { gross, discount, net, taxAmount, lineTotal: calc(net.plus(taxAmount)) };
}

export interface DocumentTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
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
  doc: { discountAmount?: Numeric; discountPercent?: Numeric } = {},
): DocumentTotals {
  const subtotal = calc(
    lines.reduce((sum, l) => sum.plus(l.net), new Decimal(0)),
  );
  const lineTax = calc(
    lines.reduce((sum, l) => sum.plus(l.taxAmount), new Decimal(0)),
  );

  const percentPart = subtotal.times(dec(doc.discountPercent).dividedBy(100));
  const rawDiscount = percentPart.plus(dec(doc.discountAmount));
  const discountAmount = calc(Decimal.min(subtotal, rawDiscount));

  return {
    subtotal,
    discountAmount,
    taxAmount: lineTax,
    total: calc(subtotal.minus(discountAmount).plus(lineTax)),
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
export const RESERVING_STATUSES: OrderStatus[] = ['CONFIRMED', 'IN_PRODUCTION', 'READY'];

/** Available to promise — what a salesperson may actually sell. */
export function available(onHand: Numeric, reserved: Numeric): Decimal {
  return calc(dec(onHand).minus(dec(reserved)));
}

export function isQuotationStatus(v: string): v is QuotationStatus {
  return (QUOTATION_STATUSES as readonly string[]).includes(v);
}

export function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v);
}
