import { dec, formatQty, PRICE_SERVICE_AR, type PriceService } from '@erp/domain';
import { prisma } from '@/lib/prisma';

/**
 * استهلاك القطعة من مستلزم — سطرٌ «perPiece=…» في ملاحظاته، بلا عمودٍ جديد.
 *
 * للحساب والعرض وحدهما (بطلب المالك: «يتحسب لكن ما يأثر على السستم»): «يكفي
 * لكم قطعة» و«المحسوب من مبيعات الشهر» — لا ينزّل من الرصيد شيئاً ولا يسجّل
 * حركة ولا مصروفاً. الاستهلاك الفعلي يبقى حركةً يسجّلها صاحبها.
 */
const PER_PIECE = 'perPiece=';

export function perPieceOf(notes: string | null | undefined): number | null {
  const line = (notes ?? '').split('\n').find((l) => l.startsWith(PER_PIECE));
  const v = line ? Number(line.slice(PER_PIECE.length)) : Number.NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function withPerPiece(notes: string | null | undefined, value: number | null | undefined): string | null {
  const rest = (notes ?? '').split('\n').filter((l) => !l.startsWith(PER_PIECE));
  if (value && value > 0) rest.push(`${PER_PIECE}${value}`);
  const out = rest.join('\n').trim();
  return out || null;
}

/** خدمات الطلب التي يستهلك منها كل نوع مستلزم: الخيط للتطريز، والحبر والفلم للطباعة. */
export const SERVICES_OF_SUPPLY_KIND: Record<string, PriceService[]> = {
  EMBROIDERY: ['EMBROIDERY'],
  PRINTING: ['PRINTING', 'DTF'],
};

/** خدمة بند الفاتورة من وصفه المجمّد: «منتج · لون · مقاس — تطريز — تفاصيل». */
export function serviceOfDescription(description: string): PriceService | null {
  const parts = description.split(' — ').slice(1);
  for (const [key, ar] of Object.entries(PRICE_SERVICE_AR)) {
    if (parts.includes(ar)) return key as PriceService;
  }
  return null;
}

/**
 * شراء المستلزمات في المصروفات.
 *
 * ── لماذا ─────────────────────────────────────────────────
 *
 * شاشة المستلزمات كانت تقول «مشتريات الشهر» ولا يراها أحدٌ غيرها: لا
 * المصروفات ولا تقرير الربح ولا التدفق النقدي. فالمال الذي خرج في حبرٍ
 * وخيوط لا يُخصم من الربح أبداً — والمالك طلب أن يُحسب.
 *
 * ── كيف ───────────────────────────────────────────────────
 *
 * كل شراءٍ يُقيَّد مصروفاً «مستلزمات ولوازم» معتمداً بتاريخ الشراء، كأجرة
 * التوصيل تماماً: مرآةُ مستندٍ مبلغه مكتوب عليه، لا مطالبةٌ ينتظر صاحبها
 * الاعتماد. والوسم في آخر الملاحظة يربطه بحركته: به يُعرف ما قُيِّد فلا
 * يتكرر، وبالملاحظة يُمسح مع تصفير المستلزمات.
 */
export const SUPPLY_EXPENSE_NOTE = 'شراء مستلزمات';

export function supplyExpenseTag(txId: string): string {
  return `#${txId.slice(-6)}`;
}

type Amount = Parameters<typeof dec>[0];

export function supplyExpenseData(
  user: { tenantId: string; id: string },
  number: string,
  t: { id: string; txDate: Date; quantity: Amount; totalCost: Amount },
  supply: { nameAr: string; unit: string | null },
) {
  const qty = `${formatQty(dec(t.quantity))} ${supply.unit ?? ''}`.trim();
  return {
    tenantId: user.tenantId,
    number,
    expenseDate: t.txDate,
    category: 'SUPPLIES' as const,
    // دينارٌ كامل — لا كسور في النظام (قاعدة المالك).
    amount: dec(t.totalCost).toDecimalPlaces(0).toString(),
    notes: `${SUPPLY_EXPENSE_NOTE}: ${supply.nameAr} — ${qty} ${supplyExpenseTag(t.id)}`,
    status: 'APPROVED' as const,
    approvedById: user.id,
    approvedAt: new Date(),
    createdById: user.id,
  };
}

/** مشترياتٌ بسعرٍ سُجّلت قبل هذا الربط ولم تُقيَّد بعد — للمالك أن يحسبها بضغطة. */
export async function unpostedSupplyPurchases(tenantId: string) {
  const [purchases, posted] = await Promise.all([
    prisma.supplyTransaction.findMany({
      where: { tenantId, type: 'PURCHASE', totalCost: { gt: 0 } },
      orderBy: { txDate: 'asc' },
      select: {
        id: true,
        txDate: true,
        quantity: true,
        totalCost: true,
        supply: { select: { nameAr: true, unit: true } },
      },
    }),
    // المحذوف منها يُعدّ مقيَّداً: من حذف المصروف بيده لا يُعاد عليه.
    prisma.secondaryExpense.findMany({
      where: { tenantId, category: 'SUPPLIES', notes: { startsWith: SUPPLY_EXPENSE_NOTE } },
      select: { notes: true },
    }),
  ]);
  const tags = new Set(posted.map((e) => e.notes?.split(' ').pop()));
  return purchases.filter((p) => !tags.has(supplyExpenseTag(p.id)));
}
