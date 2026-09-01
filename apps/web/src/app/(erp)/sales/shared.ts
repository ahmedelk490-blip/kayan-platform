import 'server-only';

import { prisma } from '@/lib/prisma';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Next document number, scoped to tenant and year: QUO-2026-0001.
 *
 * Derived from the highest existing number rather than a counter table, so
 * it cannot drift out of step with reality. Not gapless — DI-6 requires that
 * only for fiscal documents, which these are not; invoices will need the
 * sequence-allocation approach instead.
 */
export async function nextDocumentNumber(
  kind: 'QUO' | 'SO',
  tenantId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${kind}-${year}-`;

  const rows =
    kind === 'QUO'
      ? await prisma.quotation.findMany({
          where: { tenantId, number: { startsWith: prefix } },
          select: { number: true },
        })
      : await prisma.salesOrder.findMany({
          where: { tenantId, number: { startsWith: prefix } },
          select: { number: true },
        });

  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.number.slice(prefix.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);

  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** Append an entry to the customer timeline. */
export async function timeline(input: {
  customerId: string;
  type: string;
  title: string;
  body?: string | null;
  userId?: string | null;
}) {
  await prisma.customerActivity.create({
    data: {
      customerId: input.customerId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      userId: input.userId ?? null,
    },
  });
}

// التطبيع صار عامّاً في lib/num — يُعاد تصديره هنا إبقاءً على مستورديه.
export { normalizeDigits } from '@/lib/num';
import { normalizeDigits } from '@/lib/num';

/** Parse a decimal form value, defaulting to 0. */
export function decimal(value: FormDataEntryValue | null): number {
  const n = Number(normalizeDigits(String(value ?? '')));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read repeated line inputs out of a form.
 *
 * Lines are submitted as parallel arrays (`lines.variantId[]`, etc.) so a
 * user can add and remove rows without any client-side state machine.
 */
export function readLines(formData: FormData) {
  const variantIds = formData.getAll('lineVariantId').map(String);
  const quantities = formData.getAll('lineQuantity').map(String);
  const prices = formData.getAll('lineUnitPrice').map(String);
  const discounts = formData.getAll('lineDiscount').map(String);
  const taxRates = formData.getAll('lineTaxRate').map(String);
  const notes = formData.getAll('lineNotes').map(String);

  // num يطبّع الأرقام العربية قبل التحويل، فسطرٌ كميته «٥» لا يسقط. القيمة
  // غير الصالحة تصير صفراً لا NaN، والصفر يُفلتر لاحقاً كما يجب.
  const num = (v: string | undefined) => {
    const n = Number(normalizeDigits(String(v ?? '')));
    return Number.isFinite(n) ? n : 0;
  };

  return variantIds
    .map((variantId, i) => ({
      variantId,
      quantity: num(quantities[i]),
      unitPrice: num(prices[i]),
      discountAmount: num(discounts[i]),
      taxRate: num(taxRates[i]),
      notes: notes[i]?.trim() || null,
    }))
    .filter((l) => l.variantId && l.quantity > 0);
}
