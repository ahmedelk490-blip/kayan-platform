import { Decimal } from 'decimal.js';

/**
 * شرائح الأسعار — اختيار السعر حسب الخدمة والكمية.
 *
 * منطق خالٍ من أي إطار، كبقية هذه الحزمة، فيمكن اختباره دون خادم ولا
 * قاعدة بيانات.
 */

export const PRICE_SERVICES = ['NONE', 'EMBROIDERY', 'DTF', 'PRINTING'] as const;
export type PriceService = (typeof PRICE_SERVICES)[number];

export const PRICE_SERVICE_AR: Record<PriceService, string> = {
  NONE: 'بدون خدمة',
  EMBROIDERY: 'تطريز',
  DTF: 'طباعة DTF',
  PRINTING: 'طباعة',
};

export function isPriceService(value: string): value is PriceService {
  return (PRICE_SERVICES as readonly string[]).includes(value);
}

export interface Tier {
  id: string;
  variantId: string | null;
  service: string;
  minQty: number;
  maxQty: number | null;
  price: Decimal | string | number;
  currency: string;
  isActive: boolean;
}

/**
 * أقل ما تحتاجه دوال الاختيار من الشريحة. يتيح تمرير كائن مبسّط عبر حدّ
 * الخادم/العميل دون حمل الحقول غير المستعملة (id, currency).
 */
export type TierMatch = Pick<Tier, 'variantId' | 'service' | 'minQty' | 'maxQty' | 'price' | 'isActive'>;

/** هل الكمية داخل نطاق الشريحة؟ */
export function tierCovers(tier: Pick<Tier, 'minQty' | 'maxQty'>, quantity: number): boolean {
  if (quantity < tier.minQty) return false;
  return tier.maxQty === null || quantity <= tier.maxQty;
}

/**
 * الشريحة المطبَّقة على كمية وخدمة.
 *
 * شريحة المتغيّر تسبق شريحة المنتج: من حدّد سعراً لمقاس بعينه قصد ذلك،
 * ولا يصحّ أن يطغى عليه سعر عام. وبين شريحتين متساويتَي التحديد تفوز
 * الأضيق نطاقاً — لأن "أقل من 6" أدقّ من "من 1 وما فوق".
 *
 * تُرجع null حين لا تغطّي أي شريحة. لا سعر افتراضي مخترع: سعر خاطئ على
 * عرض سعر أسوأ من غياب سعر.
 */
export function applicableTier<T extends TierMatch>(
  tiers: T[],
  options: { service: string; quantity: number; variantId?: string | null },
): T | null {
  const { service, quantity, variantId = null } = options;

  const candidates = tiers.filter(
    (t) =>
      t.isActive &&
      t.service === service &&
      tierCovers(t, quantity) &&
      (t.variantId === null || t.variantId === variantId),
  );
  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    // 1) المتغيّر يسبق المنتج.
    const aSpecific = a.variantId ? 0 : 1;
    const bSpecific = b.variantId ? 0 : 1;
    if (aSpecific !== bSpecific) return aSpecific - bSpecific;

    // 2) النطاق الأضيق يسبق. المفتوح (maxQty فارغة) هو الأوسع دائماً.
    const aWidth = a.maxQty === null ? Number.POSITIVE_INFINITY : a.maxQty - a.minQty;
    const bWidth = b.maxQty === null ? Number.POSITIVE_INFINITY : b.maxQty - b.minQty;
    if (aWidth !== bWidth) return aWidth - bWidth;

    // 3) الحد الأدنى الأعلى يسبق — أقرب لكمية الطلب.
    return b.minQty - a.minQty;
  })[0];
}

/** إجمالي سطر بشريحة. يُرجع null حين لا سعر — لا صفر. */
export function tierLineTotal<T extends TierMatch>(
  tiers: T[],
  options: { service: string; quantity: number; variantId?: string | null },
): Decimal | null {
  const tier = applicableTier(tiers, options);
  if (!tier) return null;
  return new Decimal(tier.price.toString())
    .times(options.quantity)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * فجوات التغطية — كميات لا تغطّيها أي شريحة.
 *
 * تُعرض للمدير بدل أن تُكتشف عند أول عرض سعر بلا سعر.
 */
export function coverageGaps<T extends Tier>(tiers: T[], service: string): string[] {
  const active = tiers
    .filter((t) => t.isActive && t.service === service)
    .sort((a, b) => a.minQty - b.minQty);
  if (active.length === 0) return ['لا توجد شريحة لهذه الخدمة إطلاقاً.'];

  const gaps: string[] = [];
  if (active[0].minQty > 1) gaps.push(`من 1 إلى ${active[0].minQty - 1}`);

  for (let i = 0; i < active.length - 1; i += 1) {
    const end = active[i].maxQty;
    if (end === null) break; // نطاق مفتوح يغطّي ما بعده
    const nextStart = active[i + 1].minQty;
    if (nextStart > end + 1) gaps.push(`من ${end + 1} إلى ${nextStart - 1}`);
  }

  const last = active[active.length - 1];
  if (last.maxQty !== null) gaps.push(`أكثر من ${last.maxQty}`);

  return gaps;
}
