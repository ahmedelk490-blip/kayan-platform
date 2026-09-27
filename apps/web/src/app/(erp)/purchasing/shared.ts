import 'server-only';

import { prisma } from '@/lib/prisma';
import { num } from '@/lib/num';

/** Types and helpers a `'use server'` module cannot export. */

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/** PO-2026-0001 / GRN-2026-0001, derived from the highest existing number. */
export async function nextPurchaseNumber(
  kind: 'PO' | 'GRN' | 'SPY',
  tenantId: string,
): Promise<string> {
  const stem = `${kind}-${new Date().getFullYear()}-`;
  const where = { tenantId, number: { startsWith: stem } };
  const select = { number: true } as const;
  const rows =
    kind === 'PO'
      ? await prisma.purchaseOrder.findMany({ where, select })
      : kind === 'GRN'
        ? await prisma.goodsReceipt.findMany({ where, select })
        : await prisma.supplierPayment.findMany({ where, select });

  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.number.slice(stem.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `${stem}${String(max + 1).padStart(4, '0')}`;
}

/** Read repeated line inputs, the same parallel-array shape sales uses. */
export function readPurchaseLines(formData: FormData) {
  const targets = formData.getAll('lineTarget').map(String);
  const refs = formData.getAll('lineRef').map(String);
  const quantities = formData.getAll('lineQuantity').map(String);
  const prices = formData.getAll('lineUnitPrice').map(String);
  const discounts = formData.getAll('lineDiscount').map(String);
  const taxes = formData.getAll('lineTaxRate').map(String);
  const descriptions = formData.getAll('lineDescription').map(String);

  return targets
    .map((target, i) => ({
      target,
      ref: refs[i] ?? '',
      quantity: num(quantities[i]),
      unitPrice: num(prices[i]),
      discountAmount: num(discounts[i]),
      taxRate: num(taxes[i]),
      description: descriptions[i]?.trim() || null,
    }))
    .filter((l) => l.ref && l.quantity > 0);
}
