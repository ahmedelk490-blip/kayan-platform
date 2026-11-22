import { prisma } from './prisma';

/**
 * إعدادات الأسعار التي يختارها المدير (بطلب المالك):
 *  - سعر البيع في الكاشير والفاتورة: الجديد (الحالي) أو القديم (ما قبل آخر تغيير).
 *  - تكلفة البضاعة المباعة: من الدفعة الأقدم أولاً أو الأحدث أولاً.
 * تُحفظ في SiteContent (group pricing) بلا عمود جديد.
 */
export type SellMode = 'new' | 'old';
export type CostMode = 'oldest' | 'newest';

const SELL_KEY = 'pricing_sell_mode';
const COST_KEY = 'pricing_cost_mode';
const PREV_PREFIX = 'prevprice:';

export async function pricingSettings(tenantId: string): Promise<{ sell: SellMode; cost: CostMode }> {
  const rows = await prisma.siteContent.findMany({
    where: { tenantId, key: { in: [SELL_KEY, COST_KEY] } },
    select: { key: true, valueAr: true },
  });
  const get = (k: string) => rows.find((r) => r.key === k)?.valueAr;
  return {
    sell: get(SELL_KEY) === 'old' ? 'old' : 'new',
    cost: get(COST_KEY) === 'newest' ? 'newest' : 'oldest',
  };
}

export async function savePricingSettings(tenantId: string, sell: SellMode, cost: CostMode): Promise<void> {
  for (const [key, value, label] of [
    [SELL_KEY, sell, 'سعر البيع: قديم/جديد'],
    [COST_KEY, cost, 'التكلفة: الأقدم/الأحدث'],
  ] as const) {
    await prisma.siteContent.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { valueAr: value },
      create: { tenantId, key, valueAr: value, group: 'pricing', label },
    });
  }
}

/** يحفظ سعر البيع القديم للمنتج قبل تغييره — ليبيع به الكاشير إن اختار المدير «القديم». */
export async function rememberOldPrice(tenantId: string, productId: string, oldPrice: number | null): Promise<void> {
  if (oldPrice === null || !(oldPrice > 0)) return;
  const key = `${PREV_PREFIX}${productId}`;
  await prisma.siteContent.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { valueAr: String(oldPrice) },
    create: { tenantId, key, valueAr: String(oldPrice), group: 'pricing', label: 'سعر البيع القديم' },
  });
}

/** أسعار البيع القديمة لكل المنتجات — productId → السعر. */
export async function oldPrices(tenantId: string): Promise<Map<string, number>> {
  const rows = await prisma.siteContent.findMany({
    where: { tenantId, key: { startsWith: PREV_PREFIX } },
    select: { key: true, valueAr: true },
  });
  return new Map(rows.map((r) => [r.key.slice(PREV_PREFIX.length), Number(r.valueAr)]).filter(([, v]) => (v as number) > 0) as [string, number][]);
}
