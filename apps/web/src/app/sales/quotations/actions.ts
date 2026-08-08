'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  calcLine,
  calcDocument,
  canTransition,
  QUOTATION_TRANSITIONS,
  QUOTATION_STATUS_AR,
  isQuotationStatus,
  type QuotationStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { nextDocumentNumber, timeline, readLines, decimal, type FormState } from '../shared';

const HeaderSchema = z.object({
  customerId: z.string().min(1, 'العميل مطلوب.'),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build line rows with a PRICING SNAPSHOT.
 *
 * unitPrice comes from the submitted form, which is pre-filled from the
 * variant's current price — but once written it belongs to the document. A
 * later price change must never alter what was quoted.
 */
function buildLines(
  raw: ReturnType<typeof readLines>,
  variants: { id: string; productId: string }[],
) {
  const byId = new Map(variants.map((v) => [v.id, v]));
  // rows are what gets written; totals are kept alongside for the document
  // roll-up. Two arrays rather than one object with a field to strip later.
  const rows = [];
  const totals = [];

  for (const [index, line] of raw.entries()) {
    const variant = byId.get(line.variantId);
    if (!variant) continue;
    const t = calcLine(line);
    rows.push({
      lineNo: index + 1,
      productId: variant.productId,
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

  return { rows, totals };
}

export async function createQuotation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('sales.write');
  const parsed = HeaderSchema.safeParse({
    customerId: String(formData.get('customerId') ?? ''),
    issueDate: String(formData.get('issueDate') ?? ''),
    expiryDate: String(formData.get('expiryDate') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const raw = readLines(formData);
  if (raw.length === 0) return { error: 'أضف بنداً واحداً على الأقل بكمية أكبر من صفر.' };

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: raw.map((l) => l.variantId) }, product: { tenantId: user.tenantId } },
    select: { id: true, productId: true },
  });
  const { rows, totals } = buildLines(raw, variants);
  if (rows.length === 0) return { error: 'المتغيّرات المختارة غير صالحة.' };

  const doc = calcDocument(
    totals,
    { discountAmount: decimal(formData.get('discountAmount')), discountPercent: decimal(formData.get('discountPercent')) },
  );

  const created = await prisma.quotation.create({
    data: {
      tenantId: user.tenantId,
      number: await nextDocumentNumber('QUO', user.tenantId),
      customerId: parsed.data.customerId,
      salesRepId: user.id,
      status: 'DRAFT',
      issueDate: parseDate(parsed.data.issueDate) ?? new Date(),
      expiryDate: parseDate(parsed.data.expiryDate),
      notes: parsed.data.notes || null,
      subtotal: doc.subtotal,
      discountAmount: doc.discountAmount,
      discountPercent: decimal(formData.get('discountPercent')),
      taxAmount: doc.taxAmount,
      total: doc.total,
      lines: {
        create: rows,
      },
    },
  });

  await timeline({
    customerId: parsed.data.customerId,
    type: 'SYSTEM',
    title: `عرض سعر ${created.number}`,
    body: `تم إنشاء عرض سعر بإجمالي ${doc.total}`,
    userId: user.id,
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'quotation.create',
    entityType: 'Quotation',
    entityId: created.id,
    detail: created.number,
  });

  revalidatePath('/sales/quotations');
  redirect(`/sales/quotations/${created.id}`);
}

export async function updateQuotation(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('sales.write');

  const current = await prisma.quotation.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) return { error: 'عرض السعر غير موجود.' };
  if (current.status === 'CONVERTED') {
    return { error: 'لا يمكن تعديل عرض سعر تم تحويله إلى أمر بيع.' };
  }

  const parsed = HeaderSchema.safeParse({
    customerId: String(formData.get('customerId') ?? ''),
    issueDate: String(formData.get('issueDate') ?? ''),
    expiryDate: String(formData.get('expiryDate') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const raw = readLines(formData);
  if (raw.length === 0) return { error: 'أضف بنداً واحداً على الأقل بكمية أكبر من صفر.' };

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: raw.map((l) => l.variantId) }, product: { tenantId: user.tenantId } },
    select: { id: true, productId: true },
  });
  const { rows, totals } = buildLines(raw, variants);
  const doc = calcDocument(
    totals,
    { discountAmount: decimal(formData.get('discountAmount')), discountPercent: decimal(formData.get('discountPercent')) },
  );

  await prisma.$transaction([
    prisma.quotationLine.deleteMany({ where: { quotationId: id } }),
    prisma.quotation.update({
      where: { id },
      data: {
        customerId: parsed.data.customerId,
        issueDate: parseDate(parsed.data.issueDate) ?? current.issueDate,
        expiryDate: parseDate(parsed.data.expiryDate),
        notes: parsed.data.notes || null,
        subtotal: doc.subtotal,
        discountAmount: doc.discountAmount,
        discountPercent: decimal(formData.get('discountPercent')),
        taxAmount: doc.taxAmount,
        total: doc.total,
        lines: { create: rows },
      },
    }),
  ]);

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'quotation.update',
    entityType: 'Quotation',
    entityId: id,
    detail: current.number,
  });

  revalidatePath(`/sales/quotations/${id}`);
  return { ok: 'تم حفظ التعديلات.' };
}

export async function changeQuotationStatus(id: string, next: string): Promise<void> {
  const user = await requirePermission('sales.write');
  if (!isQuotationStatus(next)) return;

  const current = await prisma.quotation.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current || !isQuotationStatus(current.status)) return;
  if (!canTransition(QUOTATION_TRANSITIONS, current.status as QuotationStatus, next)) return;

  await prisma.quotation.update({ where: { id }, data: { status: next } });

  if (next === 'ACCEPTED' || next === 'REJECTED') {
    await timeline({
      customerId: current.customerId,
      type: 'SYSTEM',
      title: `عرض سعر ${current.number} — ${QUOTATION_STATUS_AR[next]}`,
      userId: user.id,
    });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'quotation.status',
    entityType: 'Quotation',
    entityId: id,
    detail: `${current.status} -> ${next}`,
  });

  revalidatePath(`/sales/quotations/${id}`);
  revalidatePath('/sales/quotations');
}

export async function deleteQuotation(id: string): Promise<void> {
  const user = await requirePermission('sales.write');
  const current = await prisma.quotation.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) redirect('/sales/quotations');
  if (current.status === 'CONVERTED') redirect(`/sales/quotations/${id}`);

  await prisma.quotation.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'quotation.softDelete',
    entityType: 'Quotation',
    entityId: id,
    detail: current.number,
  });

  revalidatePath('/sales/quotations');
  redirect('/sales/quotations');
}

/** Copy a quotation into a fresh DRAFT, snapshot prices and all. */
export async function duplicateQuotation(id: string): Promise<void> {
  const user = await requirePermission('sales.write');
  const source = await prisma.quotation.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { lines: true },
  });
  if (!source) redirect('/sales/quotations');

  const copy = await prisma.quotation.create({
    data: {
      tenantId: user.tenantId,
      number: await nextDocumentNumber('QUO', user.tenantId),
      customerId: source.customerId,
      salesRepId: user.id,
      status: 'DRAFT',
      issueDate: new Date(),
      notes: source.notes,
      subtotal: source.subtotal,
      discountAmount: source.discountAmount,
      discountPercent: source.discountPercent,
      taxAmount: source.taxAmount,
      total: source.total,
      lines: {
        create: source.lines.map((l) => ({
          lineNo: l.lineNo,
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          discountPercent: l.discountPercent,
          taxRate: l.taxRate,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
          notes: l.notes,
        })),
      },
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'quotation.duplicate',
    entityType: 'Quotation',
    entityId: copy.id,
    detail: `${source.number} -> ${copy.number}`,
  });

  redirect(`/sales/quotations/${copy.id}`);
}

/**
 * Convert an ACCEPTED quotation into a sales order.
 *
 * Only from ACCEPTED, and the quotation moves to CONVERTED — which is
 * terminal — so one quotation can never produce two orders.
 */
export async function convertToOrder(id: string): Promise<void> {
  const user = await requirePermission('sales.write');

  const quotation = await prisma.quotation.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { lines: true },
  });
  if (!quotation) redirect('/sales/quotations');
  if (quotation.status !== 'ACCEPTED') redirect(`/sales/quotations/${id}`);

  const number = await nextDocumentNumber('SO', user.tenantId);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.salesOrder.create({
      data: {
        tenantId: user.tenantId,
        number,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        salesRepId: user.id,
        status: 'DRAFT',
        orderDate: new Date(),
        notes: quotation.notes,
        subtotal: quotation.subtotal,
        discountAmount: quotation.discountAmount,
        discountPercent: quotation.discountPercent,
        taxAmount: quotation.taxAmount,
        total: quotation.total,
        lines: {
          create: quotation.lines.map((l) => ({
            lineNo: l.lineNo,
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
            // Prices carry across untouched — the order must agree with the
            // quotation the customer accepted, not with today's price list.
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            discountPercent: l.discountPercent,
            taxRate: l.taxRate,
            taxAmount: l.taxAmount,
            lineTotal: l.lineTotal,
            notes: l.notes,
          })),
        },
      },
    });

    await tx.quotation.update({ where: { id }, data: { status: 'CONVERTED' } });
    return created;
  });

  await timeline({
    customerId: quotation.customerId,
    type: 'SYSTEM',
    title: `أمر بيع ${order.number}`,
    body: `تم تحويل عرض السعر ${quotation.number} إلى أمر بيع`,
    userId: user.id,
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'quotation.convert',
    entityType: 'SalesOrder',
    entityId: order.id,
    detail: `${quotation.number} -> ${order.number}`,
  });

  revalidatePath('/sales/quotations');
  revalidatePath('/sales/orders');
  redirect(`/sales/orders/${order.id}`);
}
