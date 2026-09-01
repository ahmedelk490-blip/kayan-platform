'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  PRODUCTION_TRANSITIONS,
  PRODUCTION_STATUS_AR,
  isProductionStatus,
  isPriority,
  isWorkOrderStatus,
  type ProductionStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { numeric } from '@/lib/num';
import { nextProductionNumber, type FormState } from './shared';

const Schema = z.object({
  variantId: z.string().min(1, 'المتغيّر مطلوب.'),
  quantity: numeric(z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر.')),
  priority: z.string().refine(isPriority, 'أولوية غير معروفة.'),
  salesOrderId: z.string().optional(),
  customerId: z.string().optional(),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

function parseDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function read(formData: FormData) {
  return {
    variantId: String(formData.get('variantId') ?? ''),
    quantity: String(formData.get('quantity') ?? ''),
    priority: String(formData.get('priority') ?? 'NORMAL'),
    salesOrderId: String(formData.get('salesOrderId') ?? ''),
    customerId: String(formData.get('customerId') ?? ''),
    plannedStartDate: String(formData.get('plannedStartDate') ?? ''),
    plannedEndDate: String(formData.get('plannedEndDate') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  };
}

export async function createProductionOrder(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('manufacturing.write');
  const parsed = Schema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const variant = await prisma.productVariant.findFirst({
    where: { id: parsed.data.variantId, isDeleted: false },
    include: { product: true },
  });
  if (!variant || variant.product.tenantId !== user.tenantId) {
    return { error: 'المتغيّر غير موجود.' };
  }

  // A linked sales order supplies the customer; a stock order has none.
  let customerId = parsed.data.customerId || null;
  let salesOrderLineId: string | null = null;

  if (parsed.data.salesOrderId) {
    const so = await prisma.salesOrder.findFirst({
      where: { id: parsed.data.salesOrderId, tenantId: user.tenantId, isDeleted: false },
      include: { lines: { where: { variantId: variant.id } } },
    });
    if (!so) return { fieldErrors: { salesOrderId: 'أمر البيع غير موجود.' } };
    customerId = so.customerId;
    salesOrderLineId = so.lines[0]?.id ?? null;
  }

  const created = await prisma.productionOrder.create({
    data: {
      tenantId: user.tenantId,
      number: await nextProductionNumber(user.tenantId),
      salesOrderId: parsed.data.salesOrderId || null,
      salesOrderLineId,
      customerId,
      productId: variant.productId,
      variantId: variant.id,
      quantity: parsed.data.quantity,
      priority: parsed.data.priority,
      status: 'DRAFT',
      plannedStartDate: parseDate(parsed.data.plannedStartDate),
      plannedEndDate: parseDate(parsed.data.plannedEndDate),
      notes: parsed.data.notes || null,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'production.create',
    entityType: 'ProductionOrder',
    entityId: created.id,
    detail: created.number,
  });

  revalidatePath('/manufacturing');
  redirect(`/manufacturing/${created.id}`);
}

export async function updateProductionOrder(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('manufacturing.write');
  const current = await prisma.productionOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) return { error: 'أمر الإنتاج غير موجود.' };
  if (current.status !== 'DRAFT') {
    return { error: 'لا يمكن تعديل أمر إنتاج بعد تأكيده. استخدم تغيير الحالة.' };
  }

  const parsed = Schema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const variant = await prisma.productVariant.findFirst({
    where: { id: parsed.data.variantId, isDeleted: false },
    include: { product: true },
  });
  if (!variant || variant.product.tenantId !== user.tenantId) {
    return { error: 'المتغيّر غير موجود.' };
  }

  // The link can be changed or removed while the order is still a draft.
  let customerId: string | null = null;
  let salesOrderLineId: string | null = null;
  if (parsed.data.salesOrderId) {
    const so = await prisma.salesOrder.findFirst({
      where: { id: parsed.data.salesOrderId, tenantId: user.tenantId, isDeleted: false },
      include: { lines: { where: { variantId: variant.id } } },
    });
    if (!so) return { fieldErrors: { salesOrderId: 'أمر البيع غير موجود.' } };
    customerId = so.customerId;
    salesOrderLineId = so.lines[0]?.id ?? null;
  }

  await prisma.productionOrder.update({
    where: { id },
    data: {
      productId: variant.productId,
      variantId: variant.id,
      quantity: parsed.data.quantity,
      priority: parsed.data.priority,
      salesOrderId: parsed.data.salesOrderId || null,
      salesOrderLineId,
      customerId,
      plannedStartDate: parseDate(parsed.data.plannedStartDate),
      plannedEndDate: parseDate(parsed.data.plannedEndDate),
      notes: parsed.data.notes || null,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'production.update',
    entityType: 'ProductionOrder',
    entityId: id,
    detail: current.number,
  });

  revalidatePath(`/manufacturing/${id}`);
  return { ok: 'تم حفظ التعديلات.' };
}

/**
 * Move a production order through the workflow.
 *
 * ⚠ DELIBERATE DEVIATION, stated rather than hidden.
 *
 * The brief asked for a stock movement when the order reaches IN_PROGRESS.
 * Without a BOM there is nothing knowable to consume — posting a movement
 * there would be inventing material consumption, which the same brief
 * forbids. So:
 *
 *   IN_PROGRESS → records actualStartDate and audits. No stock movement,
 *                 because no material quantity is knowable yet.
 *   COMPLETED   → posts a real RECEIPT for the finished goods. That IS
 *                 knowable: the order produced `quantity` units of a known
 *                 variant, so stock genuinely increases.
 *
 * Material issue on start arrives with the Formula Engine, when a BOM can
 * say what and how much.
 */
export async function changeProductionStatus(id: string, next: string): Promise<void> {
  const user = await requirePermission('manufacturing.confirm');
  if (!isProductionStatus(next)) return;

  const order = await prisma.productionOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { salesOrder: true },
  });
  if (!order || !isProductionStatus(order.status)) return;

  const from = order.status as ProductionStatus;
  if (!PRODUCTION_TRANSITIONS[from].includes(next)) return;

  const now = new Date();
  const stamps: Record<string, Date> = {};
  if (next === 'CONFIRMED') stamps.confirmedAt = order.confirmedAt ?? now;
  if (next === 'IN_PROGRESS') {
    stamps.startedAt = order.startedAt ?? now;
    stamps.actualStartDate = order.actualStartDate ?? now;
  }
  if (next === 'COMPLETED') {
    stamps.completedAt = now;
    stamps.actualEndDate = order.actualEndDate ?? now;
  }
  if (next === 'CANCELLED') stamps.cancelledAt = now;

  await tenantTransaction(async (tx) => {
    await tx.productionOrder.update({ where: { id }, data: { status: next, ...stamps } });

    // Finished-goods receipt — once, on completion. The unique constraint on
    // (productionOrderId, type) is the backstop if two requests race.
    if (next === 'COMPLETED') {
      const already = await tx.stockMovement.findFirst({
        where: { productionOrderId: id, type: 'RECEIPT' },
      });
      const warehouse = already
        ? null
        : await tx.warehouse.findFirst({
            where: { tenantId: user.tenantId, isDeleted: false },
            orderBy: { code: 'asc' },
          });

      if (warehouse) {
        await tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId: order.productId,
            variantId: order.variantId,
            warehouseId: warehouse.id,
            type: 'RECEIPT',
            quantity: order.quantity,
            reference: order.number,
            reason: 'إنتاج تام — استلام من أمر إنتاج',
            userId: user.id,
            productionOrderId: id,
          },
        });

        const stock = await tx.stock.findFirst({
          where: { variantId: order.variantId, warehouseId: warehouse.id, locationId: null },
        });
        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data: { onHand: { increment: order.quantity } },
          });
        } else {
          await tx.stock.create({
            data: {
              variantId: order.variantId,
              warehouseId: warehouse.id,
              onHand: order.quantity,
            },
          });
        }
      }
    }

    // Keep the linked sales order in step.
    const so = order.salesOrder;
    if (so && !so.isDeleted) {
      if (next === 'IN_PROGRESS' && so.status === 'CONFIRMED') {
        await tx.salesOrder.update({ where: { id: so.id }, data: { status: 'IN_PRODUCTION' } });
      }
      if (next === 'COMPLETED' && so.status === 'IN_PRODUCTION') {
        // Only when every other production order for this sales order is done.
        const outstanding = await tx.productionOrder.count({
          where: {
            salesOrderId: so.id,
            isDeleted: false,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            NOT: { id },
          },
        });
        if (outstanding === 0) {
          await tx.salesOrder.update({ where: { id: so.id }, data: { status: 'READY' } });
        }
      }
    }
  });

  if (order.customerId) {
    await prisma.customerActivity.create({
      data: {
        customerId: order.customerId,
        type: 'SYSTEM',
        title: `أمر إنتاج ${order.number} — ${PRODUCTION_STATUS_AR[next]}`,
        userId: user.id,
      },
    });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'production.status',
    entityType: 'ProductionOrder',
    entityId: id,
    detail: `${from} -> ${next}`,
  });

  revalidatePath('/manufacturing');
  revalidatePath(`/manufacturing/${id}`);
  revalidatePath('/inventory');
  if (order.salesOrderId) revalidatePath(`/sales/orders/${order.salesOrderId}`);
}

export async function deleteProductionOrder(id: string): Promise<void> {
  const user = await requirePermission('manufacturing.write');
  const order = await prisma.productionOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!order) redirect('/manufacturing');
  // An order that has reached the floor must be cancelled, not hidden.
  if (order.status !== 'DRAFT' && order.status !== 'CANCELLED') {
    redirect(`/manufacturing/${id}`);
  }

  await prisma.productionOrder.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'production.softDelete',
    entityType: 'ProductionOrder',
    entityId: id,
    detail: order.number,
  });

  revalidatePath('/manufacturing');
  redirect('/manufacturing');
}

// ── Work orders ─────────────────────────────────────────────

const WorkOrderSchema = z.object({
  name: z.string().trim().min(2, 'اسم الخطوة مطلوب.').max(120),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export async function addWorkOrder(
  productionOrderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('manufacturing.write');
  const parsed = WorkOrderSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const order = await prisma.productionOrder.findFirst({
    where: { id: productionOrderId, tenantId: user.tenantId, isDeleted: false },
    include: { workOrders: { orderBy: { sequence: 'desc' }, take: 1 } },
  });
  if (!order) return { error: 'أمر الإنتاج غير موجود.' };

  await prisma.workOrder.create({
    data: {
      productionOrderId,
      sequence: (order.workOrders[0]?.sequence ?? 0) + 1,
      name: parsed.data.name,
      notes: parsed.data.notes || null,
    },
  });

  revalidatePath(`/manufacturing/${productionOrderId}`);
  return { ok: 'تمت إضافة الخطوة.' };
}

export async function setWorkOrderStatus(
  productionOrderId: string,
  workOrderId: string,
  next: string,
): Promise<void> {
  await requirePermission('manufacturing.write');
  if (!isWorkOrderStatus(next)) return;

  const now = new Date();
  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      status: next,
      ...(next === 'IN_PROGRESS' ? { actualStartDate: now } : {}),
      ...(next === 'DONE' ? { actualEndDate: now } : {}),
    },
  });

  revalidatePath(`/manufacturing/${productionOrderId}`);
}
