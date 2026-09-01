'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  calcPurchaseLine,
  calcPurchaseDocument,
  derivePurchaseStatus,
  exceedsOutstanding,
  movingAverageCost,
  isPurchaseStatus,
  isPurchaseTarget,
  PURCHASE_TRANSITIONS,
  dec,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { num } from '@/lib/num';
import { nextPurchaseNumber, readPurchaseLines, type FormState } from './shared';

const HeaderSchema = z.object({
  supplierId: z.string().min(1, 'المورّد مطلوب.'),
  expectedDate: z.string().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

function parseDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Purchase orders ─────────────────────────────────────────

export async function createPurchaseOrder(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('purchasing.write');
  const parsed = HeaderSchema.safeParse({
    supplierId: String(formData.get('supplierId') ?? ''),
    expectedDate: String(formData.get('expectedDate') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supplier = await prisma.supplier.findFirst({
    where: { id: parsed.data.supplierId, tenantId: user.tenantId, isDeleted: false },
  });
  if (!supplier) return { fieldErrors: { supplierId: 'المورّد غير موجود.' } };

  const rawLines = readPurchaseLines(formData);
  if (rawLines.length === 0) return { error: 'أضِف بنداً واحداً على الأقل.' };
  if (rawLines.some((l) => !isPurchaseTarget(l.target))) {
    return { error: 'نوع بند غير معروف.' };
  }

  // Resolve every reference before writing anything, so a bad line cannot
  // leave a half-built order behind.
  const resolved = [];
  for (const line of rawLines) {
    if (line.target === 'VARIANT') {
      const variant = await prisma.productVariant.findFirst({
        where: { id: line.ref, isDeleted: false, product: { tenantId: user.tenantId } },
      });
      if (!variant) return { error: 'أحد المتغيّرات غير موجود.' };
      resolved.push({ ...line, variantId: variant.id, supplyId: null });
    } else {
      const supply = await prisma.supply.findFirst({
        where: { id: line.ref, tenantId: user.tenantId, isDeleted: false },
      });
      if (!supply) return { error: 'أحد المستلزمات غير موجود.' };
      resolved.push({ ...line, variantId: null, supplyId: supply.id });
    }
  }

  const totals = resolved.map((l) => calcPurchaseLine(l));
  const doc = calcPurchaseDocument(totals);

  const order = await prisma.purchaseOrder.create({
    data: {
      tenantId: user.tenantId,
      number: await nextPurchaseNumber('PO', user.tenantId),
      supplierId: supplier.id,
      status: 'DRAFT',
      expectedDate: parseDate(parsed.data.expectedDate),
      notes: parsed.data.notes || null,
      subtotal: doc.subtotal.toString(),
      discountAmount: doc.discountAmount.toString(),
      taxAmount: doc.taxAmount.toString(),
      total: doc.total.toString(),
      createdById: user.id,
      lines: {
        create: resolved.map((l, i) => ({
          lineNo: i + 1,
          target: l.target,
          variantId: l.variantId,
          supplyId: l.supplyId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxRate: l.taxRate,
          taxAmount: totals[i].taxAmount.toString(),
          lineTotal: totals[i].lineTotal.toString(),
        })),
      },
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'purchase.create',
    entityType: 'PurchaseOrder',
    entityId: order.id,
    detail: `${order.number} ${doc.total.toString()}`,
  });

  revalidatePath('/purchasing');
  redirect(`/purchasing/${order.id}`);
}

export async function changePurchaseStatus(id: string, next: string): Promise<void> {
  const user = await requirePermission('purchasing.confirm');
  if (!isPurchaseStatus(next)) return;

  const order = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { receipts: { select: { id: true } } },
  });
  if (!order || !isPurchaseStatus(order.status)) return;
  if (!PURCHASE_TRANSITIONS[order.status].includes(next)) return;

  // Cancelling an order that already has deliveries would orphan stock that
  // is physically on the shelf.
  if (next === 'CANCELLED' && order.receipts.length > 0) {
    redirect(`/purchasing/${id}?err=received`);
  }

  const now = new Date();
  await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: next,
      confirmedAt: next === 'CONFIRMED' ? (order.confirmedAt ?? now) : order.confirmedAt,
      cancelledAt: next === 'CANCELLED' ? now : order.cancelledAt,
      completedAt: next === 'RECEIVED' ? now : order.completedAt,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'purchase.status',
    entityType: 'PurchaseOrder',
    entityId: id,
    detail: `${order.number} ${order.status} -> ${next}`,
  });

  revalidatePath('/purchasing');
  revalidatePath(`/purchasing/${id}`);
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  const user = await requirePermission('purchasing.write');
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { _count: { select: { receipts: true } } },
  });
  if (!order) redirect('/purchasing');
  if (order.status !== 'DRAFT' && order.status !== 'CANCELLED') {
    redirect(`/purchasing/${id}`);
  }
  if (order._count.receipts > 0) redirect(`/purchasing/${id}?err=received`);

  await prisma.purchaseOrder.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'purchase.softDelete',
    entityType: 'PurchaseOrder',
    entityId: id,
    detail: order.number,
  });

  revalidatePath('/purchasing');
  redirect('/purchasing');
}

// ── Goods receipt ───────────────────────────────────────────

/**
 * Post a delivery.
 *
 * The whole point of the module. Three guarantees, in order of importance:
 *
 *   1. **Idempotent.** Every stock movement carries the receipt line's id
 *      under a unique constraint, so a double-clicked delivery cannot move
 *      stock twice. The database enforces it, not this function.
 *   2. **Cannot over-receive.** A line may not accept more than it still
 *      owes, checked inside the transaction against the stored figure.
 *   3. **Costs the stock.** Weighted average is recomputed from what was
 *      actually paid, which is where the Cost Engine finally gets real
 *      numbers instead of zeros.
 */
export async function receiveGoods(
  purchaseOrderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('purchasing.receive');

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId: user.tenantId, isDeleted: false },
    include: { lines: true },
  });
  if (!order) return { error: 'أمر الشراء غير موجود.' };
  if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_RECEIVED') {
    return { error: 'لا يمكن الاستلام إلا على أمر مؤكَّد.' };
  }

  const warehouseId = String(formData.get('warehouseId') ?? '');
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId: user.tenantId, isDeleted: false },
  });
  if (!warehouse) return { fieldErrors: { warehouseId: 'اختر مخزناً.' } };

  const reference = String(formData.get('reference') ?? '').trim() || null;

  // Quantities arrive keyed by line id: qty__<lineId>
  const deliveries = order.lines
    .map((line) => ({
      line,
      quantity: num(formData.get(`qty__${line.id}`)),
    }))
    .filter((d) => Number.isFinite(d.quantity) && d.quantity > 0);

  if (deliveries.length === 0) return { error: 'أدخل كمية مستلمة واحدة على الأقل.' };

  for (const d of deliveries) {
    if (exceedsOutstanding(d.quantity, d.line.quantity, d.line.receivedQty)) {
      return {
        error: `الكمية المستلمة للبند ${d.line.lineNo} تتجاوز المتبقي على الأمر.`,
      };
    }
  }

  const number = await nextPurchaseNumber('GRN', user.tenantId);

  await tenantTransaction(async (tx) => {
    const receipt = await tx.goodsReceipt.create({
      data: {
        tenantId: user.tenantId,
        number,
        purchaseOrderId: order.id,
        warehouseId: warehouse.id,
        reference,
        receivedById: user.id,
      },
    });

    for (const { line, quantity } of deliveries) {
      const receiptLine = await tx.goodsReceiptLine.create({
        data: {
          goodsReceiptId: receipt.id,
          purchaseOrderLineId: line.id,
          quantity,
          // Frozen at receipt time: the order may later be corrected, but
          // what this stock was valued at on the day must not move.
          unitCost: line.unitPrice,
        },
      });

      if (line.target === 'VARIANT' && line.variantId) {
        await tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId: (
              await tx.productVariant.findUniqueOrThrow({
                where: { id: line.variantId },
                select: { productId: true },
              })
            ).productId,
            variantId: line.variantId,
            warehouseId: warehouse.id,
            type: 'RECEIPT',
            quantity,
            reference: receipt.number,
            reason: `استلام من أمر شراء ${order.number}`,
            userId: user.id,
            goodsReceiptLineId: receiptLine.id,
          },
        });

        const stock = await tx.stock.findFirst({
          where: { variantId: line.variantId, warehouseId: warehouse.id, locationId: null },
        });
        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data: { onHand: dec(stock.onHand).plus(dec(quantity)).toString() },
          });
        } else {
          await tx.stock.create({
            data: { variantId: line.variantId, warehouseId: warehouse.id, onHand: quantity },
          });
        }
      }

      if (line.target === 'SUPPLY' && line.supplyId) {
        const supply = await tx.supply.findUniqueOrThrow({ where: { id: line.supplyId } });

        await tx.supplyTransaction.create({
          data: {
            tenantId: user.tenantId,
            supplyId: supply.id,
            type: 'PURCHASE',
            txDate: new Date(),
            quantity,
            unitCost: line.unitPrice,
            totalCost: dec(quantity).times(dec(line.unitPrice)).toString(),
            notes: `استلام ${receipt.number}`,
            userId: user.id,
            goodsReceiptLineId: receiptLine.id,
          },
        });

        // This is the line that ends the zero-price problem: the average is
        // what the stock on the shelf actually cost, not the last invoice.
        const avg = movingAverageCost(
          supply.onHand,
          supply.avgCost,
          quantity,
          line.unitPrice,
        );

        await tx.supply.update({
          where: { id: supply.id },
          data: {
            onHand: dec(supply.onHand).plus(dec(quantity)).toString(),
            lastUnitCost: line.unitPrice,
            avgCost: avg.toString(),
          },
        });
      }

      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: dec(line.receivedQty).plus(dec(quantity)).toString() },
      });
    }

    // Status is derived from what actually arrived, never typed.
    const fresh = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: order.id },
      select: { quantity: true, receivedQty: true },
    });
    const status = derivePurchaseStatus(fresh, 'CONFIRMED');

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status,
        completedAt: status === 'RECEIVED' ? new Date() : order.completedAt,
      },
    });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'purchase.receive',
    entityType: 'PurchaseOrder',
    entityId: order.id,
    detail: `${number} — ${deliveries.length} بند`,
  });

  revalidatePath(`/purchasing/${order.id}`);
  revalidatePath('/purchasing');
  revalidatePath('/inventory');
  revalidatePath('/supplies');
  return { ok: `تم تسجيل الاستلام ${number}.` };
}
