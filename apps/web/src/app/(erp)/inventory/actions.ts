'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { dec, formatQty } from '@erp/domain';
import { audit, fieldErrors } from '@/lib/audit';
import { num, numeric } from '@/lib/num';
import { TYPES, type MovementType } from './types';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/**
 * Apply a delta to the stock projection.
 *
 * Prisma cannot target a compound unique that contains a nullable column
 * with `null` — `variantId_warehouseId_locationId` includes an optional
 * locationId — so this finds the row first and then writes, instead of
 * upserting. Same effect, and it handles "no location" correctly.
 */
async function applyStockDelta(
  tx: Tx,
  key: { variantId: string; warehouseId: string; locationId: string | null },
  field: 'onHand' | 'reserved' | 'damaged',
  delta: number,
) {
  const existing = await tx.stock.findFirst({ where: key });

  if (existing) {
    await tx.stock.update({
      where: { id: existing.id },
      data: { [field]: { increment: delta } },
    });
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

const MovementSchema = z.object({
  variantId: z.string().min(1, 'المتغيّر مطلوب.'),
  type: z.enum(Object.keys(TYPES) as [MovementType, ...MovementType[]]),
  quantity: numeric(z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر.')),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  reason: z.string().trim().max(400).optional().or(z.literal('')),
});

/**
 * المخزن الافتراضي للمستأجر. المخزن واحد بطلب المالك — فلا يُختار في الفورم،
 * بل يُحسم هنا. أوّل مخزن غير محذوف مرتّباً بالرمز.
 */
async function defaultWarehouseId(tenantId: string): Promise<string | null> {
  const wh = await prisma.warehouse.findFirst({
    where: { tenantId, isDeleted: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  });
  return wh?.id ?? null;
}

/**
 * Post a stock movement and update the projection in one transaction.
 *
 * The movement is the record of truth (DI-2); Stock is a derived balance
 * kept alongside it so a list page does not have to sum history. Both are
 * written together or neither is.
 */
export async function postMovement(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('inventory.write');

  const parsed = MovementSchema.safeParse({
    variantId: String(formData.get('variantId') ?? ''),
    type: String(formData.get('type') ?? 'RECEIPT'),
    quantity: String(formData.get('quantity') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { variantId, type, quantity } = parsed.data;
  // المخزن واحد — يُحسم تلقائياً بلا اختيار، والموقع بلا رفوف (null).
  const warehouseId = await defaultWarehouseId(user.tenantId);
  if (!warehouseId) return { error: 'لا يوجد مخزن معرّف بعد. أضِف مخزناً أولاً.' };
  const locationId = null;
  const meta = TYPES[type];
  const delta = meta.sign * quantity;

  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, isDeleted: false },
    include: { product: true },
  });
  if (!variant || variant.product.tenantId !== user.tenantId) {
    return { error: 'المتغيّر غير موجود.' };
  }

  const existing = await prisma.stock.findFirst({ where: { variantId, warehouseId, locationId } });

  // Refuse to drive a balance negative. An adjustment is the deliberate way
  // to correct a wrong balance, and it leaves a record saying so.
  if (delta < 0) {
    const current = dec(
      existing ? (meta.field === 'reserved' ? existing.reserved : existing.onHand) : 0,
    );
    if (current.plus(delta).isNegative()) {
      return {
        error: `الرصيد الحالي ${formatQty(current)} لا يسمح بهذه الحركة. استخدم تسوية إذا كان الرصيد غير صحيح.`,
      };
    }
  }

  await tenantTransaction(async (tx) => {
    await tx.stockMovement.create({
      data: {
        tenantId: user.tenantId,
        productId: variant.productId,
        variantId,
        warehouseId,
        locationId,
        type,
        quantity: delta,
        reference: parsed.data.reference || null,
        reason: parsed.data.reason || null,
        userId: user.id,
      },
    });

    await applyStockDelta(tx, { variantId, warehouseId, locationId }, meta.field, delta);
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'stock.movement',
    entityType: 'ProductVariant',
    entityId: variantId,
    detail: `${type} ${delta}`,
  });

  revalidatePath('/inventory');
  // صفحة المنتج تعرض رصيد كل متغيّر، والحركة قد تُسجَّل من هناك مباشرة —
  // بلا هذا السطر يبقى الرقم القديم معروضاً بعد الإضافة.
  revalidatePath(`/catalog/products/${variant.productId}`);
  return { ok: `تم تسجيل الحركة: ${meta.labelAr} ${quantity}` };
}

/**
 * Reverse a movement.
 *
 * Never deletes. Posts an opposite movement that points back at the original
 * via reversesId, so the history keeps both the mistake and the correction.
 */
export async function reverseMovement(movementId: string): Promise<void> {
  const user = await requirePermission('inventory.write');

  const original = await prisma.stockMovement.findFirst({
    where: { id: movementId, tenantId: user.tenantId },
    include: { reversedBy: true },
  });
  if (!original || original.reversedBy) return;

  const meta = TYPES[original.type as MovementType] ?? TYPES.ADJUSTMENT;

  await tenantTransaction(async (tx) => {
    await tx.stockMovement.create({
      data: {
        tenantId: user.tenantId,
        productId: original.productId,
        variantId: original.variantId,
        warehouseId: original.warehouseId,
        locationId: original.locationId,
        type: 'REVERSAL',
        quantity: -original.quantity,
        reference: original.reference,
        reason: `عكس حركة ${original.id}`,
        userId: user.id,
        reversesId: original.id,
      },
    });

    await applyStockDelta(
      tx,
      {
        variantId: original.variantId,
        warehouseId: original.warehouseId,
        locationId: original.locationId,
      },
      meta.field,
      -original.quantity,
    );
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'stock.reverse',
    entityType: 'StockMovement',
    entityId: movementId,
  });

  revalidatePath('/inventory');
}

const LevelSchema = z.object({
  stockId: z.string().min(1),
  minStock: numeric(z.coerce.number().min(0)),
  maxStock: z.string().trim().optional(),
});

/** Min/max are policy, not movement — they do not touch the ledger. */
export async function setLevels(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('inventory.write');
  const parsed = LevelSchema.safeParse({
    stockId: String(formData.get('stockId') ?? ''),
    minStock: String(formData.get('minStock') ?? '0'),
    maxStock: String(formData.get('maxStock') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const max = parsed.data.maxStock ? num(parsed.data.maxStock) : null;
  if (max !== null && Number.isFinite(max) && max < parsed.data.minStock) {
    return { fieldErrors: { maxStock: 'الحد الأقصى يجب أن يكون أكبر من الأدنى.' } };
  }

  // updateMany بشرط المستأجر: stockId يصل من المتصفح، وبلا الشرط كان يعدّل
  // صفوف مستأجرين آخرين.
  await prisma.stock.updateMany({
    where: { id: parsed.data.stockId, variant: { product: { tenantId: user.tenantId } } },
    data: { minStock: parsed.data.minStock, maxStock: max },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'stock.levels',
    entityType: 'Stock',
    entityId: parsed.data.stockId,
  });

  revalidatePath('/inventory');
  return { ok: 'تم حفظ الحدود.' };
}

/**
 * تحديد الحدّ الأدنى (حدّ إعادة الطلب) لرصيد منتج — عند بلوغه أو النزول تحته
 * يظهر الصنف في «نواقص وإعادة الطلب» لتوفيره. صفر = بلا تنبيه بحدّ.
 */
export async function setMinStock(stockId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('inventory.write');
  const value = Math.max(0, Math.round(num(formData.get('minStock'))));
  const st = await prisma.stock.findFirst({
    where: { id: stockId, variant: { product: { tenantId: user.tenantId } } },
    select: { id: true },
  });
  if (!st) return { error: 'الرصيد غير موجود.' };
  await prisma.stock.update({ where: { id: stockId }, data: { minStock: value } });
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'stock.minStock', entityType: 'Stock', entityId: stockId, detail: String(value) });
  revalidatePath('/inventory');
  return { ok: 'تم تحديث الحد الأدنى.' };
}

/**
 * حذف حركة نهائياً — لتنظيف ما سُجِّل للتجربة.
 *
 * السجل في الأصل لا يُحذف: هو شاهدٌ على ما جرى ومتى، وحذفُه يُفقد القدرة على
 * تفسير فرقٍ في الجرد لاحقاً. لكن صفّاً سُجِّل للتجربة ليس شهادةً على شيء،
 * وإبقاؤه يُفسد القراءة إلى الأبد.
 *
 * فالحذف مسموح بشرطٍ واحد لا يُخرَق: **الرصيد لا يتغيّر**. أثر الحركة يُطرح
 * من المخزون قبل حذفها، وإن كانت معكوسةً حُذفت مع عكسها معاً (مجموعهما صفر
 * أصلاً). والحذف نفسه يُقيَّد في سجل التدقيق بكل تفاصيل المحذوف — فلا شيء
 * يضيع بلا أثر، وإن غاب الصفّ.
 */
export async function deleteMovement(movementId: string): Promise<void> {
  const user = await requirePermission('inventory.write');

  const original = await prisma.stockMovement.findFirst({
    where: { id: movementId, tenantId: user.tenantId },
    include: { reversedBy: true, variant: { select: { sku: true } } },
  });
  if (!original) redirect('/inventory?tab=movements');

  // حركة عكسية لا تُحذف وحدها: حذفُها يترك أصلها ساري المفعول على الرصيد
  // بينما يظنّ القارئ أنه صُحِّح. تُحذف من صفّ أصلها.
  if (original.type === 'REVERSAL') {
    redirect('/inventory?tab=movements&err=reversal-child');
  }

  const meta = TYPES[original.type as MovementType] ?? TYPES.ADJUSTMENT;
  const key = {
    variantId: original.variantId,
    warehouseId: original.warehouseId,
    locationId: original.locationId,
  };

  await tenantTransaction(async (tx) => {
    if (original.reversedBy) {
      // الزوج مجموعه صفر: يُحذف كما هو دون أي تسوية للرصيد.
      await tx.stockMovement.delete({ where: { id: original.reversedBy.id } });
    } else {
      // حركة سارية: يُطرح أثرها أولاً فيبقى الرصيد كما لو لم تُسجَّل قط.
      await applyStockDelta(tx, key, meta.field, -Number(original.quantity));
    }
    await tx.stockMovement.delete({ where: { id: original.id } });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'stock.movementDelete',
    entityType: 'StockMovement',
    entityId: movementId,
    detail:
      `حُذفت نهائياً: ${meta.labelAr} ${formatQty(original.quantity)} · ` +
      `${original.variant?.sku ?? original.variantId} · ` +
      `${original.occurredAt.toISOString().slice(0, 10)}` +
      `${original.reversedBy ? ' (مع عكسها)' : ' (وسُوّي الرصيد)'}` +
      `${original.reason ? ` · ${original.reason}` : ''}`,
  });

  revalidatePath('/inventory');
  redirect('/inventory?tab=movements');
}
