import { dec } from '@erp/domain';
import { pricingSettings } from './pricing';
import type { tenantTransaction } from './prisma';
import { isDeliveryDesc } from './delivery';

/**
 * دفعات البضاعة بأسعارها — الأقدم أولاً (بطلب المالك).
 *
 * كل إدخال بضاعة بسعرٍ يصير دفعة (CostLayer). حين تُصدَر فاتورة تأخذ قطعها من
 * أقدم دفعةٍ فيها رصيد لنفس الموديل واللون، وتُسجَّل تكلفة القطعة على سطر
 * الفاتورة (InvoiceLine.unitCost) — فالربح القديم لا يتغيّر حين تصل بضاعة
 * أغلى. وما أخذته الفاتورة من كل دفعة يُحفظ (CostLayerUse) ليعود للدفعة عند
 * تعديل الفاتورة أو إلغائها.
 */
type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** تكلفة القطعة الاحتياطية حين لا دفعة: اللون، ثم المنتج، ثم الدستة ÷ قطعها. */
function fallbackCost(
  variantCost: unknown,
  product: { cost: unknown; dozenCost: unknown; piecesPerDozen: number } | null,
) {
  const v = variantCost == null ? null : dec(variantCost as never);
  if (v?.gt(0)) return v;
  const p = product?.cost == null ? null : dec(product.cost as never);
  if (p?.gt(0)) return p;
  const d = product?.dozenCost == null ? null : dec(product.dozenCost as never);
  if (d?.gt(0) && product && product.piecesPerDozen > 0) return d.dividedBy(product.piecesPerDozen);
  return null;
}

/**
 * سجل أسعار الجملة (بطلب المالك): المدير يكتب سعر جملة الموديل مرةً، وكل قطعة
 * تُباع بعده تُحسب به حتى يُسجَّل سعر جديد. يُخزَّن صفاً في CostLayer بكمية 0
 * وملاحظة WHOLESALE_NOTE (بلا جدول جديد)، فلا يُستهلك كدفعة أبداً.
 */
export const WHOLESALE_NOTE = 'سعر جملة';

type Db = Pick<Tx, 'costLayer'>;

export async function recordWholesalePrice(
  db: Db,
  data: { tenantId: string; productId: string; unitCost: number; userId?: string },
): Promise<void> {
  if (!(data.unitCost > 0)) return;
  await db.costLayer.create({
    data: {
      tenantId: data.tenantId,
      productId: data.productId,
      colorId: null,
      quantity: 0,
      remaining: 0,
      unitCost: data.unitCost,
      note: WHOLESALE_NOTE,
      userId: data.userId ?? null,
    },
  });
}

/** آخر سعر جملة مسجّل للموديل حتى تاريخ معيّن — أو null إن لم يُسجَّل له سعر. */
async function wholesalePriceAt(tx: Tx, tenantId: string, productId: string, at: Date) {
  const r = await tx.costLayer.findFirst({
    where: { tenantId, productId, note: WHOLESALE_NOTE, quantity: 0, receivedAt: { lte: at } },
    orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    select: { unitCost: true },
  });
  return r ? dec(r.unitCost) : null;
}

/** يعيد ما أخذته الفاتورة إلى دفعاتها ويمسح تكلفة أسطرها. */
export async function releaseInvoiceCost(tx: Tx, invoiceId: string): Promise<void> {
  const uses = await tx.costLayerUse.findMany({ where: { invoiceId } });
  for (const u of uses) {
    await tx.costLayer.update({ where: { id: u.layerId }, data: { remaining: { increment: u.quantity } } });
  }
  if (uses.length) await tx.costLayerUse.deleteMany({ where: { invoiceId } });
  await tx.invoiceLine.updateMany({ where: { invoiceId }, data: { unitCost: null } });
}

/**
 * يضبط تكلفة فاتورة بعد أي تغيير عليها: يعيد ما أخذته، ثم — إن كانت صادرة غير
 * ملغاة — يأخذ لكل سطر من أقدم الدفعات. ما لا تغطّيه الدفعات يُحسب بتكلفة
 * المنتج الحالية.
 */
export async function syncInvoiceCost(tx: Tx, tenantId: string, invoiceId: string): Promise<void> {
  await releaseInvoiceCost(tx, invoiceId);
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      status: true,
      isDeleted: true,
      issueDate: true,
      lines: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          description: true,
          variant: { select: { colorId: true, cost: true } },
          product: { select: { cost: true, dozenCost: true, piecesPerDozen: true } },
        },
      },
    },
  });
  if (!invoice || invoice.isDeleted || invoice.status === 'DRAFT' || invoice.status === 'VOID') return;
  // المدير يختار: الأقدم أولاً (الافتراضي) أو الأحدث أولاً (lib/pricing).
  const order = (await pricingSettings(tenantId)).cost === 'newest' ? 'desc' : 'asc';

  for (const l of invoice.lines) {
    if (!l.productId || isDeliveryDesc(l.description)) continue;
    let need = dec(l.quantity);
    if (need.lte(0)) continue;
    // سعر الجملة المسجّل وقت إصدار الفاتورة يُقدَّم على الدفعات.
    const wholesale = await wholesalePriceAt(tx, tenantId, l.productId, invoice.issueDate ?? new Date());
    if (wholesale) {
      await tx.invoiceLine.update({ where: { id: l.id }, data: { unitCost: wholesale.toDecimalPlaces(4).toString() } });
      continue;
    }
    const layers = await tx.costLayer.findMany({
      where: { tenantId, productId: l.productId, colorId: l.variant?.colorId ?? null, remaining: { gt: 0 } },
      orderBy: [{ receivedAt: order }, { createdAt: order }],
    });
    let total = dec(0);
    let covered = dec(0);
    for (const layer of layers) {
      if (need.lte(0)) break;
      const take = need.lt(dec(layer.remaining)) ? need : dec(layer.remaining);
      await tx.costLayer.update({ where: { id: layer.id }, data: { remaining: { decrement: take.toString() } } });
      await tx.costLayerUse.create({
        data: { layerId: layer.id, invoiceId, quantity: take.toString(), unitCost: layer.unitCost },
      });
      total = total.plus(take.times(dec(layer.unitCost)));
      covered = covered.plus(take);
      need = need.minus(take);
    }
    if (need.gt(0)) {
      const fb = fallbackCost(l.variant?.cost, l.product);
      if (fb) {
        total = total.plus(need.times(fb));
        covered = covered.plus(need);
      }
    }
    if (covered.gt(0)) {
      await tx.invoiceLine.update({
        where: { id: l.id },
        data: { unitCost: total.dividedBy(covered).toDecimalPlaces(4).toString() },
      });
    }
  }
}

/** دفعة بضاعة جديدة بسعرها (إدخال بضاعة من المخزون). */
export async function addCostLayer(
  tx: Tx,
  data: { tenantId: string; productId: string; colorId: string | null; quantity: number; unitCost: number; note?: string; userId?: string },
): Promise<void> {
  if (!(data.quantity > 0) || !(data.unitCost > 0)) return;
  await tx.costLayer.create({
    data: {
      tenantId: data.tenantId,
      productId: data.productId,
      colorId: data.colorId,
      quantity: data.quantity,
      remaining: data.quantity,
      unitCost: data.unitCost,
      note: data.note ?? null,
      userId: data.userId ?? null,
    },
  });
}

/**
 * حذف أو عكس حركة «استلام» يُسقط دفعتها: الدفعة التي أنشأها نفس الاستلام
 * (نفس الموديل واللون والكمية، وفي نفس اللحظة تقريباً). إن بِيع منها شيء يبقى
 * ما أُخذ مسجّلاً على فواتيره ويُصفَّر باقيها فقط.
 */
export async function dropReceiptLayer(
  tx: Tx,
  m: { tenantId: string; productId: string; variantId: string; quantity: unknown; createdAt: Date },
): Promise<void> {
  const v = await tx.productVariant.findUnique({ where: { id: m.variantId }, select: { colorId: true } });
  const qty = dec(m.quantity as never).abs();
  const layer = await tx.costLayer.findFirst({
    where: {
      tenantId: m.tenantId,
      productId: m.productId,
      colorId: v?.colorId ?? null,
      quantity: qty.toString(),
      createdAt: { gte: new Date(m.createdAt.getTime() - 15_000), lte: new Date(m.createdAt.getTime() + 15_000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!layer) return;
  if (dec(layer.remaining).eq(dec(layer.quantity))) await tx.costLayer.delete({ where: { id: layer.id } });
  else await tx.costLayer.update({ where: { id: layer.id }, data: { remaining: 0 } });
}
