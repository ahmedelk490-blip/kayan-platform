'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  calcLine,
  calcDocument,
  canTransition,
  ORDER_TRANSITIONS,
  ORDER_STATUS_AR,
  isOrderStatus,
  RESERVING_STATUSES,
  type OrderStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { nextDocumentNumber, timeline, readLines, decimal, type FormState } from '../shared';
import { reserveForOrder, releaseForOrder, defaultWarehouseId } from '../reservations';

const HeaderSchema = z.object({
  customerId: z.string().min(1, 'العميل مطلوب.'),
  orderDate: z.string().optional(),
  requiredDeliveryDate: z.string().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('sales.write');
  const parsed = HeaderSchema.safeParse({
    customerId: String(formData.get('customerId') ?? ''),
    orderDate: String(formData.get('orderDate') ?? ''),
    requiredDeliveryDate: String(formData.get('requiredDeliveryDate') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const raw = readLines(formData);
  if (raw.length === 0) return { error: 'أضف بنداً واحداً على الأقل بكمية أكبر من صفر.' };

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: raw.map((l) => l.variantId) }, product: { tenantId: user.tenantId } },
    select: { id: true, productId: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  // rows are written; totals feed the document roll-up. Kept as two arrays
  // so no field has to be stripped before the insert.
  const rows = [];
  const totals = [];
  for (const [index, line] of raw.entries()) {
    const v = byId.get(line.variantId);
    if (!v) continue;
    const t = calcLine(line);
    rows.push({
      lineNo: index + 1,
      productId: v.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      discountPercent: 0,
      taxRate: line.taxRate,
      taxAmount: t.taxAmount,
      lineTotal: t.lineTotal,
      notes: line.notes,
    });
    totals.push(t);
  }
  if (rows.length === 0) return { error: 'المتغيّرات المختارة غير صالحة.' };

  const doc = calcDocument(totals, {
    discountAmount: decimal(formData.get('discountAmount')),
    discountPercent: decimal(formData.get('discountPercent')),
  });

  const created = await prisma.salesOrder.create({
    data: {
      tenantId: user.tenantId,
      number: await nextDocumentNumber('SO', user.tenantId),
      customerId: parsed.data.customerId,
      salesRepId: user.id,
      status: 'DRAFT',
      orderDate: parseDate(parsed.data.orderDate) ?? new Date(),
      requiredDeliveryDate: parseDate(parsed.data.requiredDeliveryDate),
      notes: parsed.data.notes || null,
      subtotal: doc.subtotal,
      discountAmount: doc.discountAmount,
      discountPercent: decimal(formData.get('discountPercent')),
      taxAmount: doc.taxAmount,
      total: doc.total,
      lines: { create: rows },
    },
  });

  await timeline({
    customerId: parsed.data.customerId,
    type: 'SYSTEM',
    title: `أمر بيع ${created.number}`,
    body: `تم إنشاء أمر بيع بإجمالي ${doc.total}`,
    userId: user.id,
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'order.create',
    entityType: 'SalesOrder',
    entityId: created.id,
    detail: created.number,
  });

  revalidatePath('/sales/orders');
  redirect(`/sales/orders/${created.id}`);
}

/**
 * Confirm an order and reserve stock.
 *
 * IDEMPOTENT. Re-confirming an order that already holds reservations creates
 * nothing — `reserveForOrder` skips lines that already have a RESERVE, and
 * the unique constraint on (salesOrderLineId, type) is the backstop if two
 * requests race.
 */
export async function confirmOrder(id: string): Promise<void> {
  const user = await requirePermission('sales.confirm');

  const order = await prisma.salesOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { lines: true },
  });
  if (!order) redirect('/sales/orders');
  if (!isOrderStatus(order.status)) redirect(`/sales/orders/${id}`);
  if (order.status !== 'DRAFT') redirect(`/sales/orders/${id}`);

  const warehouseId = await defaultWarehouseId(user.tenantId);
  if (!warehouseId) redirect(`/sales/orders/${id}?error=no-warehouse`);

  const result = await tenantTransaction(async (tx) => {
    const r = await reserveForOrder(tx, order, user.id, warehouseId);
    await tx.salesOrder.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: order.confirmedAt ?? new Date() },
    });
    return r;
  });

  await timeline({
    customerId: order.customerId,
    type: 'SYSTEM',
    title: `أمر بيع ${order.number} — مؤكَّد`,
    body: `تم حجز المخزون لـ ${result.created} بند`,
    userId: user.id,
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'order.confirm',
    entityType: 'SalesOrder',
    entityId: id,
    detail: `reserved=${result.created} skipped=${result.skipped}`,
  });

  revalidatePath('/sales/orders');
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath('/inventory');
}

/**
 * Cancel an order and release its reservations.
 *
 * IDEMPOTENT in the same way: a line that already has an UNRESERVE is
 * skipped, and a cancelled order cannot transition again because CANCELLED
 * is terminal in ORDER_TRANSITIONS.
 */
export async function cancelOrder(id: string): Promise<void> {
  const user = await requirePermission('sales.confirm');

  const order = await prisma.salesOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { lines: true },
  });
  if (!order) redirect('/sales/orders');
  if (!isOrderStatus(order.status)) redirect(`/sales/orders/${id}`);
  if (order.status === 'CANCELLED') redirect(`/sales/orders/${id}`);
  if (!canTransition(ORDER_TRANSITIONS, order.status as OrderStatus, 'CANCELLED')) {
    redirect(`/sales/orders/${id}`);
  }

  const result = await tenantTransaction(async (tx) => {
    const r = await releaseForOrder(tx, order, user.id);
    await tx.salesOrder.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    return r;
  });

  await timeline({
    customerId: order.customerId,
    type: 'SYSTEM',
    title: `أمر بيع ${order.number} — ملغي`,
    body: `تم إلغاء حجز ${result.created} بند`,
    userId: user.id,
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'order.cancel',
    entityType: 'SalesOrder',
    entityId: id,
    detail: `released=${result.created} skipped=${result.skipped}`,
  });

  revalidatePath('/sales/orders');
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath('/inventory');
}

/** Non-reserving status moves: IN_PRODUCTION, READY, DELIVERED, COMPLETED. */
export async function changeOrderStatus(id: string, next: string): Promise<void> {
  const user = await requirePermission('sales.confirm');
  if (!isOrderStatus(next)) return;
  if (next === 'CANCELLED') return cancelOrder(id);

  const order = await prisma.salesOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!order || !isOrderStatus(order.status)) return;
  if (!canTransition(ORDER_TRANSITIONS, order.status as OrderStatus, next)) return;

  await prisma.salesOrder.update({ where: { id }, data: { status: next } });

  await timeline({
    customerId: order.customerId,
    type: 'SYSTEM',
    title: `أمر بيع ${order.number} — ${ORDER_STATUS_AR[next]}`,
    userId: user.id,
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'order.status',
    entityType: 'SalesOrder',
    entityId: id,
    detail: `${order.status} -> ${next}`,
  });

  revalidatePath(`/sales/orders/${id}`);
  revalidatePath('/sales/orders');
}

export async function deleteOrder(id: string): Promise<void> {
  const user = await requirePermission('sales.write');
  const order = await prisma.salesOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!order) redirect('/sales/orders');
  // An order holding reservations must be cancelled, not hidden.
  if (RESERVING_STATUSES.includes(order.status as OrderStatus)) {
    redirect(`/sales/orders/${id}`);
  }

  await prisma.salesOrder.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'order.softDelete',
    entityType: 'SalesOrder',
    entityId: id,
    detail: order.number,
  });

  revalidatePath('/sales/orders');
  redirect('/sales/orders');
}
