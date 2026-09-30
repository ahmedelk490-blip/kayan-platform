import { dec, formatQty } from '@erp/domain';
import { prisma } from '@/lib/prisma';

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
