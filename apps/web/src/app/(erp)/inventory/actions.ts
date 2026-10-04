'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { dec, formatQty } from '@erp/domain';
import { audit, fieldErrors } from '@/lib/audit';
import { num, numeric, normalizeDigits } from '@/lib/num';
import { TYPES, isManualMovement, type MovementType } from './types';
import { applyStockDelta } from '@/lib/stock';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
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
/**
 * عدّة مقاساتٍ في معاملةٍ واحدة.
 *
 * كلُّ مقاسٍ حركةٌ مستقلّة بمتغيّره وكميته، لكنّ الفحص والكتابة معاً: شحنةٌ
 * نصفها يمرّ ونصفها يُرفض تترك المخزون يقول ما لم يحدث. ورفض مقاسٍ واحد
 * (رصيدٌ لا يحتمل صرفاً) يُسقط الدفعة كلّها ويُسمّي المقاس.
 */
async function postManyMovements(
  tenantId: string,
  userId: string,
  entries: { id: string; qty: string }[],
  meta: { type: MovementType; reference?: string; reason?: string },
): Promise<FormState> {
  const warehouseId = await defaultWarehouseId(tenantId);
  if (!warehouseId) return { error: 'لا يوجد مخزن معرّف بعد. أضِف مخزناً أولاً.' };

  const kind = TYPES[meta.type];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: entries.map((e) => e.id) }, isDeleted: false, product: { tenantId } },
    select: { id: true, productId: true, sku: true, size: { select: { code: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  if (variants.length !== entries.length) return { error: 'أحد المقاسات غير صالح.' };

  const planned = entries.map((e) => ({
    variant: byId.get(e.id)!,
    qty: Number(normalizeDigits(e.qty)),
  }));

  // الصرف لا يُنزل رصيداً تحت الصفر — يُفحص قبل الكتابة، ويُسمّى المقاس.
  if (kind.sign < 0) {
    const held = await prisma.stock.findMany({
      where: { variantId: { in: planned.map((p) => p.variant.id) }, warehouseId, locationId: null },
      select: { variantId: true, onHand: true, reserved: true },
    });
    const heldBy = new Map(held.map((h) => [h.variantId, h]));
    for (const p of planned) {
      const row = heldBy.get(p.variant.id);
      const current = dec(row ? (kind.field === 'reserved' ? row.reserved : row.onHand) : 0);
      if (current.minus(p.qty).isNegative()) {
        return {
          error: `رصيد المقاس ${p.variant.size?.code ?? p.variant.sku} هو ${formatQty(current)} ولا يسمح بصرف ${p.qty}.`,
        };
      }
    }
  }

  await tenantTransaction(async (tx) => {
    for (const p of planned) {
      const delta = kind.sign * p.qty;
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: p.variant.productId,
          variantId: p.variant.id,
          warehouseId,
          locationId: null,
          type: meta.type,
          quantity: delta,
          reference: meta.reference || null,
          reason: meta.reason || null,
          userId,
        },
      });
      await applyStockDelta(
        tx,
        { variantId: p.variant.id, warehouseId, locationId: null },
        kind.field,
        delta,
      );
    }
  });

  const total = planned.reduce((n, p) => n + p.qty, 0);
  await audit({
    tenantId,
    userId,
    action: 'stock.movement',
    entityType: 'ProductVariant',
    entityId: planned[0].variant.id,
    detail: `${meta.type} ${total} على ${planned.length} مقاس`,
  });

  revalidatePath('/inventory');
  revalidatePath(`/catalog/products/${planned[0].variant.productId}`);
  return { ok: `تم تسجيل ${kind.labelAr}: ${total} قطعة على ${planned.length} مقاس.` };
}

/**
 * تسجيل حركة مخزون — لمقاسٍ واحد أو لمقاسات اللون كلّها دفعةً واحدة.
 *
 * كان الإدخال مقاساً بمقاس: تفتح النافذة، تختار الموديل واللون والمقاس،
 * تكتب الكمية، تحفظ، ثم تعيد الأربعة من أوّلها للمقاس التالي. والشحنة تصل
 * بستّة مقاسات، فستّ دوراتٍ كاملة لإدخالٍ واحد.
 *
 * فصارت الحقول متكرّرة: لكل مقاسٍ خانته، وما كُتب فيه أكبر من صفر يصير
 * حركةً مستقلّة بمتغيّره — في معاملةٍ واحدة، فإمّا أن تُسجَّل كلّها أو لا
 * يُسجَّل شيء. والصفر يعني «لم أستلم هذا المقاس» فيُتخطّى بلا حركةٍ فارغة.
 *
 * والشكل القديم (خانةٌ واحدة) يبقى صالحاً: حقلٌ واحد هو حالةُ الكثير.
 */
/**
 * تصحيح كمية حركةٍ أُدخلت غلطاً — «أضفنا ٦٤ والصحيح ٤٦».
 *
 * كان التصحيح عكسَ الحركة كلّها ثم إدخالها من جديد: خطوتان وسطران في السجل
 * لرقمٍ واحد أخطأه الإصبع. فصار تعديلاً للكمية نفسها، والرصيد يتحرّك بالفرق
 * وحده (٦٤ ← ٤٦ = −١٨). ولا يضيع شيء: سبب الحركة يحمل «عُدِّلت من ٦٤ إلى ٤٦»،
 * وسجلّ التدقيق يحمل من عدّل ومتى.
 *
 * بصلاحيةٍ وحدها (inventory.correct): المدير يملكها، ويمنحها لمدير المخزن من
 * «حسابات الفريق ← الصلاحيات» إن شاء. وللحركات اليدوية وحدها — حركة الفاتورة
 * والمرتجع والشراء تُصحَّح من مستندها (isManualMovement).
 */
export async function correctMovement(
  movementId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('inventory.correct');
  const qty = num(formData.get('quantity'));
  if (!(qty > 0) || !Number.isInteger(qty) || qty > 1_000_000) {
    return { fieldErrors: { quantity: 'اكتب الكمية الصحيحة بالقطع (عدد صحيح أكبر من صفر).' } };
  }

  const result = await tenantTransaction(async (tx) => {
    const m = await tx.stockMovement.findFirst({
      where: { id: movementId, tenantId: user.tenantId },
      include: { reversedBy: { select: { id: true } }, variant: { select: { sku: true } } },
    });
    if (!m) return { error: 'الحركة غير موجودة.' };
    if (m.reversedBy || !isManualMovement(m)) {
      return { error: 'هذه الحركة من مستند (فاتورة، مرتجع، شراء…) أو معكوسة — تُصحَّح من مستندها.' };
    }

    const meta = TYPES[m.type as MovementType];
    const oldSigned = dec(m.quantity);
    const newSigned = dec(meta.sign * qty);
    const delta = newSigned.minus(oldSigned);
    if (delta.isZero()) return { same: true as const };

    const key = { variantId: m.variantId, warehouseId: m.warehouseId, locationId: m.locationId };
    if (meta.field === 'onHand' && delta.isNegative()) {
      const held = await tx.stock.findFirst({
        where: { ...key, warehouse: { tenantId: user.tenantId } },
        select: { onHand: true },
      });
      const now = dec(held?.onHand ?? 0);
      if (now.plus(delta).isNegative()) {
        return {
          error: `الرصيد الآن ${formatQty(now)} لا يسمح بإنقاص ${formatQty(delta.abs())} — بِيع منه بعد الإضافة. سجّل «تسوية» بالفرق بدل تعديل الحركة.`,
        };
      }
    }

    await applyStockDelta(tx, key, meta.field, delta.toNumber());
    const note = `عُدِّلت من ${formatQty(oldSigned.abs())} إلى ${formatQty(qty)}`;
    await tx.stockMovement.update({
      where: { id: m.id },
      data: { quantity: newSigned.toString(), reason: m.reason ? `${m.reason} · ${note}` : note },
    });
    return { productId: m.productId, sku: m.variant.sku, label: meta.labelAr, note };
  });

  if ('error' in result) return { error: result.error };
  if ('same' in result) return { ok: 'الكمية كما هي — لا تغيير.' };

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'stock.movementCorrect',
    entityType: 'StockMovement',
    entityId: movementId,
    detail: `${result.label} · ${result.sku} · ${result.note}`,
  });

  revalidatePath('/inventory');
  revalidatePath(`/inventory/product/${result.productId}`);
  return { ok: `${result.note}.` };
}

export async function postMovement(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('inventory.write');

  // أزواج (متغيّر، كمية) بالترتيب نفسه — الصفر والفارغ يسقطان.
  const ids = formData.getAll('variantId').map(String);
  const qtys = formData.getAll('quantity').map(String);
  const entries = ids
    .map((id, i) => ({ id: id.trim(), qty: qtys[i] ?? '' }))
    .filter((e) => e.id && Number(normalizeDigits(e.qty)) > 0);

  if (entries.length === 0) {
    return { fieldErrors: { quantity: 'اكتب كميةً لمقاسٍ واحد على الأقل.' } };
  }

  const first = entries[0];
  const parsed = MovementSchema.safeParse({
    variantId: first.id,
    type: String(formData.get('type') ?? 'RECEIPT'),
    quantity: first.qty,
    reference: String(formData.get('reference') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  // أكثر من مقاس: تُسجَّل كلّها في معاملةٍ واحدة بمسارٍ مستقلّ.
  if (entries.length > 1) {
    return postManyMovements(user.tenantId, user.id, entries, parsed.data);
  }

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
 * شطب أرصدة الأصناف المحذوفة أو المعطّلة من منتجاتها (بطلب المالك: «هذه ما
 * راحت» — «ازوق · موحّد −18»). صنفٌ رُفع من المنتج قبل أن يصير الرفعُ يشطب رصيده
 * بقي رصيده يظهر في المخزون ويُحسب في مجاميعه. كلُّ رصيدٍ منها يُصفَّر بحركة
 * «تسوية» مسجّلة بسببها؛ والمنتج المحذوف كلّه لا يُمسّ — بضاعته على الرفّ تبقى
 * ظاهرةً موسومة «(محذوف)» عمداً.
 */
export async function writeOffRetiredStock(): Promise<void> {
  const user = await requirePermission('inventory.write');
  const count = await tenantTransaction(async (tx) => {
    const rows = await tx.stock.findMany({
      where: {
        onHand: { not: 0 },
        variant: {
          product: { tenantId: user.tenantId, isDeleted: false },
          OR: [{ isDeleted: true }, { isActive: false }],
        },
      },
      select: {
        variantId: true,
        warehouseId: true,
        locationId: true,
        onHand: true,
        variant: { select: { productId: true } },
      },
    });
    for (const r of rows) {
      const delta = dec(r.onHand).negated().toNumber();
      await tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          productId: r.variant.productId,
          variantId: r.variantId,
          warehouseId: r.warehouseId,
          locationId: r.locationId,
          type: 'ADJUSTMENT',
          quantity: delta,
          reason: 'شطب رصيد صنفٍ محذوف من منتجه',
          userId: user.id,
        },
      });
      await applyStockDelta(
        tx,
        { variantId: r.variantId, warehouseId: r.warehouseId, locationId: r.locationId },
        'onHand',
        delta,
      );
    }
    return rows.length;
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'stock.writeOffRetired',
    entityType: 'Stock',
    entityId: null,
    detail: `${count} رصيد`,
  });
  revalidatePath('/inventory');
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
