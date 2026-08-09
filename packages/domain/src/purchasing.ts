import { Decimal, dec, calc, type Numeric } from './money.ts';

/**
 * Purchasing — statuses, receipt arithmetic, and moving average cost.
 *
 * Pure data and pure functions (Article 1). The database work lives in the
 * app; everything here can be reasoned about without standing anything up.
 */

// ── Purchase order status ───────────────────────────────────

export const PURCHASE_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_AR: Record<PurchaseStatus, string> = {
  DRAFT: 'مسودة',
  CONFIRMED: 'مؤكَّد',
  PARTIALLY_RECEIVED: 'مستلم جزئياً',
  RECEIVED: 'مستلم بالكامل',
  CANCELLED: 'ملغي',
};

/**
 * Allowed transitions.
 *
 * PARTIALLY_RECEIVED and RECEIVED are not set by hand — they are computed
 * from what has actually arrived, so the status can never claim a delivery
 * that no receipt document supports. They appear here only so a cancellation
 * from a part-delivered order remains expressible.
 *
 * RECEIVED is terminal: a further delivery against a closed order is a new
 * order, not an edit of this one.
 */
export const PURCHASE_TRANSITIONS: Record<PurchaseStatus, PurchaseStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
};

/** Statuses in which stock may still arrive. */
export const OPEN_PURCHASE_STATUSES: PurchaseStatus[] = ['CONFIRMED', 'PARTIALLY_RECEIVED'];

// ── What a purchase line buys ───────────────────────────────

/**
 * A line buys exactly one of these.
 *
 * VARIANT   finished goods that go into Stock and are sold.
 * SUPPLY    consumables the floor burns — rolls, ink, thread, needles.
 *
 * Deliberately not "anything": a line with no target cannot update a
 * quantity or a cost, and would be an invoice line pretending to be a
 * purchase line.
 */
export const PURCHASE_TARGETS = ['VARIANT', 'SUPPLY'] as const;
export type PurchaseTarget = (typeof PURCHASE_TARGETS)[number];

export const PURCHASE_TARGET_AR: Record<PurchaseTarget, string> = {
  VARIANT: 'منتج جاهز',
  SUPPLY: 'مستلزمات',
};

// ── Line and document arithmetic ────────────────────────────

export interface PurchaseLineInput {
  quantity: Numeric;
  unitPrice: Numeric;
  discountAmount?: Numeric;
  taxRate?: Numeric;
}

export interface PurchaseLineTotals {
  gross: Decimal;
  discount: Decimal;
  net: Decimal;
  taxAmount: Decimal;
  lineTotal: Decimal;
}

/**
 * One purchase line.
 *
 * Same shape as the sales calculation on purpose — tax on the discounted
 * net, never on the gross, and the discount clamped so a line cannot go
 * negative. A business that computes its buying and its selling differently
 * will eventually disagree with itself about margin.
 */
export function calcPurchaseLine(input: PurchaseLineInput): PurchaseLineTotals {
  const gross = calc(dec(input.quantity).times(dec(input.unitPrice)));
  const discount = calc(Decimal.min(gross, dec(input.discountAmount)));
  const net = calc(gross.minus(discount));
  const taxAmount = calc(net.times(dec(input.taxRate).dividedBy(100)));

  return { gross, discount, net, taxAmount, lineTotal: calc(net.plus(taxAmount)) };
}

export interface PurchaseTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

export function calcPurchaseDocument(lines: PurchaseLineTotals[]): PurchaseTotals {
  const subtotal = calc(lines.reduce((s, l) => s.plus(l.net), new Decimal(0)));
  const discountAmount = calc(lines.reduce((s, l) => s.plus(l.discount), new Decimal(0)));
  const taxAmount = calc(lines.reduce((s, l) => s.plus(l.taxAmount), new Decimal(0)));

  return { subtotal, discountAmount, taxAmount, total: calc(subtotal.plus(taxAmount)) };
}

// ── Receiving ───────────────────────────────────────────────

/** Still owed on a line. Never negative — over-delivery is caught before this. */
export function outstanding(ordered: Numeric, received: Numeric): Decimal {
  const left = dec(ordered).minus(dec(received));
  return left.isNegative() ? dec(0) : calc(left);
}

/** A delivery may not exceed what remains on the line. */
export function exceedsOutstanding(
  quantity: Numeric,
  ordered: Numeric,
  received: Numeric,
): boolean {
  return dec(quantity).gt(outstanding(ordered, received));
}

/**
 * The status a purchase order should now hold, derived from its lines.
 *
 * Computed, never typed. A status the delivery notes do not support is a lie
 * the warehouse will discover at the worst moment.
 */
export function derivePurchaseStatus(
  lines: { quantity: Numeric; receivedQty: Numeric }[],
  current: PurchaseStatus,
): PurchaseStatus {
  if (current === 'CANCELLED' || current === 'DRAFT') return current;
  if (lines.length === 0) return current;

  const anyReceived = lines.some((l) => dec(l.receivedQty).gt(0));
  const allComplete = lines.every((l) => dec(l.receivedQty).gte(dec(l.quantity)));

  if (allComplete) return 'RECEIVED';
  if (anyReceived) return 'PARTIALLY_RECEIVED';
  return 'CONFIRMED';
}

// ── Moving average cost ─────────────────────────────────────

/**
 * Weighted average cost after a delivery.
 *
 * `(onHand × currentCost + received × receiptCost) ÷ (onHand + received)`
 *
 * Weighted average is the method the Constitution lists first, and the only
 * one that needs no per-unit lot tracking — which this system does not have.
 * FIFO and specific cost would each require a layer table, and pretending to
 * offer them without one would produce numbers nobody could defend.
 *
 * Two honest edge cases:
 *   - a first delivery into empty stock simply takes the receipt cost
 *   - a delivery of zero leaves the cost exactly as it was
 */
export function movingAverageCost(
  onHand: Numeric,
  currentCost: Numeric,
  receivedQty: Numeric,
  receiptCost: Numeric,
): Decimal {
  const held = dec(onHand);
  const incoming = dec(receivedQty);

  if (incoming.lte(0)) return calc(dec(currentCost));

  const total = held.plus(incoming);
  if (total.lte(0)) return calc(dec(receiptCost));
  // Nothing held, or held at no known cost: the delivery defines the cost.
  if (held.lte(0) || dec(currentCost).lte(0)) return calc(dec(receiptCost));

  const value = held.times(dec(currentCost)).plus(incoming.times(dec(receiptCost)));
  return calc(value.dividedBy(total));
}

// ── Guards ──────────────────────────────────────────────────

export function isPurchaseStatus(v: string): v is PurchaseStatus {
  return (PURCHASE_STATUSES as readonly string[]).includes(v);
}

export function isPurchaseTarget(v: string): v is PurchaseTarget {
  return (PURCHASE_TARGETS as readonly string[]).includes(v);
}
