import type Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { tenantTransaction } from './prisma';

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/**
 * أيُّ أرصدةٍ تُعرَض، وأيّها يُنبَّه عليه — تعريفٌ واحد لكل الشاشات.
 *
 * ── لماذا هذا لازم ────────────────────────────────────────
 *
 * حذفُ المنتج حذفٌ ناعم: يُعلَّم المنتج محذوفاً وتبقى متغيّراته وصفوف رصيدها
 * كما هي، ليعود كاملاً إن استُرجع. وشاشات المخزن كانت تقرأ صفوف الرصيد بلا
 * نظرٍ إلى منتجها — فمن حذف منتجاته ليبدأ كتالوجاً جديداً وجدها كلّها ما
 * زالت في المخزن «نافذة»، وجرسُ التنبيهات يطالبه بشراء ما حذفه.
 *
 * والمتغيّر المعطَّل مثله: المتغيّر الأعمّ يُعطَّل حين تُضاف للموديل ألوانه
 * ومقاساته، وصفُّ رصيده الصفريّ كان يُعدّ «نافذاً» فيضخّم العدّ.
 *
 * ── ولماذا لا يُخفى المحذوف دائماً ─────────────────────────
 *
 * منتجٌ حُذف وعلى الرفّ منه عشرون قطعة: القطع موجودة وقيمتها في الميزان.
 * إخفاؤها يجعل بضاعةً حقيقية لا يراها أحد. فالمحذوف يختفي حين يكون رصيده
 * صفراً، ويبقى ظاهراً موسوماً «محذوف» ما دام منه شيء — حتى يُصرَف أو يُسوّى.
 */
const LIVE_VARIANT = {
  isDeleted: false,
  isActive: true,
  product: { isDeleted: false },
} satisfies Prisma.ProductVariantWhereInput;

/** ما يظهر في شاشات الأرصدة والجرد: الحيّ، ومعه ما بقي منه شيء على الرفّ. */
export const STOCK_ON_SHELF = {
  OR: [
    { variant: LIVE_VARIANT },
    { onHand: { not: 0 } },
    { reserved: { not: 0 } },
    { damaged: { not: 0 } },
  ],
} satisfies Prisma.StockWhereInput;

/** ما يُنبَّه عليه ويُطلَب شراؤه: الحيّ وحده — لا أحد يعيد طلب ما حذفه. */
export const STOCK_TO_WATCH = { variant: LIVE_VARIANT } satisfies Prisma.StockWhereInput;

/** الحكم نفسه على صفٍّ مقروء — لعدّ النافذ والقارب من قائمةٍ جُلبت بالأوسع. */
export function isLiveVariant(v: {
  isDeleted: boolean;
  isActive: boolean;
  product: { isDeleted: boolean };
}): boolean {
  return !v.isDeleted && v.isActive && !v.product.isDeleted;
}

/**
 * تعديل رصيد المخزون — بجمعٍ داخل قاعدة البيانات لا بقراءةٍ ثم كتابة.
 *
 * ── لماذا هذا الفرق مهم ────────────────────────────────────
 *
 * كان كل موضعٍ يصرف بضاعةً أو يعيدها يفعلها هكذا:
 *
 *     const st = await tx.stock.findFirst(…);
 *     await tx.stock.update({ …, data: { onHand: dec(st.onHand).minus(qty) } });
 *
 * فالرقم الجديد يُحسب في Node من نسخةٍ قُرئت قبل لحظة. وإذا صدرت فاتورتان
 * لنفس المتغيّر في اللحظة نفسها — وهذا يحدث: كاشير ومندوب على هاتفين —
 * قرأت كلتاهما ٢٠، فكتبت الأولى ١٧ وكتبت الثانية ١٧ فوقها. خرجت ست قطع
 * ونقص الرصيد ثلاثاً. لا خطأ يظهر ولا شيء في السجل يشي به: الجرد وحده
 * يكتشفه بعد أسبوع، وقد صار الفرق حينها بلا سبب معروف.
 *
 * `{ increment }` يجعل الجمع جملةً واحدةً في قاعدة البيانات
 * (`onHand = onHand - 3`)، فالصفّ مقفولٌ أثناءها والثانية تبني على نتيجة
 * الأولى. لا فرق في الشكل، والفرق في الصحّة كامل.
 *
 * ── ولماذا بحثٌ ثم كتابة لا upsert ─────────────────────────
 *
 * قيد التفرّد `variantId_warehouseId_locationId` يحوي عموداً اختيارياً،
 * و`upsert` على مفتاحٍ أحد أعمدته `null` لا يطابق في MySQL. فيُبحث عن الصفّ
 * أولاً ثم يُكتب — والبحث للعثور على الصفّ لا لحساب الرقم.
 *
 * ── والرصيد السالب ─────────────────────────────────────────
 *
 * مسموحٌ عمداً: المصنع يبيع ما سيُنتَج، ومنعُه يوقف بيعاً حقيقياً. وهو يظهر
 * أحمرَ في «أرصدة المنتجات» وفي «النواقص» فلا يمرّ بلا أن يُرى.
 */
export async function applyStockDelta(
  tx: Tx,
  key: { variantId: string; warehouseId: string; locationId: string | null },
  field: 'onHand' | 'reserved' | 'damaged',
  delta: number,
): Promise<void> {
  const existing = await tx.stock.findFirst({ where: key, select: { id: true } });

  if (existing) {
    await tx.stock.update({ where: { id: existing.id }, data: { [field]: { increment: delta } } });
    return;
  }

  await tx.stock.create({
    data: {
      ...key,
      onHand: field === 'onHand' ? delta : 0,
      reserved: field === 'reserved' ? delta : 0,
      damaged: field === 'damaged' ? delta : 0,
    },
  });
}

/**
 * الحالة الشائعة: صرفُ بضاعةٍ أو إعادتها من مخزنٍ بلا موقع رفٍّ محدّد —
 * البيع والمرتجع والهالك وتعديل بنود الفاتورة كلها تمرّ من هنا.
 */
export async function adjustStock(
  tx: Tx,
  variantId: string,
  warehouseId: string,
  delta: Decimal,
): Promise<void> {
  if (delta.isZero()) return;
  await applyStockDelta(tx, { variantId, warehouseId, locationId: null }, 'onHand', delta.toNumber());
}
