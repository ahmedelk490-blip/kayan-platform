'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { dec, formatQty } from '@erp/domain';
import { audit, fieldErrors } from '@/lib/audit';
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
  warehouseId: z.string().min(1, 'المخزن مطلوب.'),
  locationId: z.string().optional(),
  type: z.enum(Object.keys(TYPES) as [MovementType, ...MovementType[]]),
  quantity: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر.'),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  reason: z.string().trim().max(400).optional().or(z.literal('')),
});

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
    warehouseId: String(formData.get('warehouseId') ?? ''),
    locationId: String(formData.get('locationId') ?? ''),
    type: String(formData.get('type') ?? 'RECEIPT'),
    quantity: String(formData.get('quantity') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { variantId, warehouseId, type, quantity } = parsed.data;
  const locationId = parsed.data.locationId || null;
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
  minStock: z.coerce.number().min(0),
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

  const max = parsed.data.maxStock ? Number(parsed.data.maxStock) : null;
  if (max !== null && Number.isFinite(max) && max < parsed.data.minStock) {
    return { fieldErrors: { maxStock: 'الحد الأقصى يجب أن يكون أكبر من الأدنى.' } };
  }

  await prisma.stock.update({
    where: { id: parsed.data.stockId },
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
