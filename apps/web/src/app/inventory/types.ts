/**
 * Movement types and their effect on the stock projection.
 *
 * Kept OUT of actions.ts because a 'use server' module may only export async
 * functions — exporting a constant from one is a build error, not a lint
 * warning, and only `next build` surfaces it.
 *
 * `sign` multiplies the entered (always positive) quantity, so the operator
 * types "50" and the system decides whether that is +50 or -50. Asking a
 * storekeeper to enter negative numbers is how stock goes wrong.
 */
export const TYPES = {
  RECEIPT: { sign: 1, field: 'onHand', labelAr: 'استلام' },
  ISSUE: { sign: -1, field: 'onHand', labelAr: 'صرف' },
  TRANSFER_IN: { sign: 1, field: 'onHand', labelAr: 'تحويل وارد' },
  TRANSFER_OUT: { sign: -1, field: 'onHand', labelAr: 'تحويل صادر' },
  ADJUSTMENT: { sign: 1, field: 'onHand', labelAr: 'تسوية' },
  RETURN: { sign: 1, field: 'onHand', labelAr: 'مرتجع' },
  RESERVE: { sign: 1, field: 'reserved', labelAr: 'حجز' },
  UNRESERVE: { sign: -1, field: 'reserved', labelAr: 'إلغاء حجز' },
  DAMAGE: { sign: 1, field: 'damaged', labelAr: 'تالف' },
  SCRAP: { sign: -1, field: 'onHand', labelAr: 'إعدام' },
} as const satisfies Record<
  string,
  { sign: 1 | -1; field: 'onHand' | 'reserved' | 'damaged'; labelAr: string }
>;

export type MovementType = keyof typeof TYPES;

export const MOVEMENT_OPTIONS = Object.entries(TYPES).map(([value, meta]) => ({
  value,
  label: meta.labelAr,
}));

export const TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.labelAr])),
  REVERSAL: 'حركة عكسية',
};
