'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  balance,
  exceedsBalance,
  deriveInvoiceStatus,
  dueDate,
  isInvoiceStatus,
  isPaymentMethod,
  INVOICE_TRANSITIONS,
  dec,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import {
  allocateInvoiceNumber,
  nextPaymentNumber,
  invoiceSettings,
  type FormState,
} from './shared';

/**
 * Create a draft invoice from a confirmed sales order.
 *
 * Lines are COPIED, not joined. The same snapshot discipline the quotation
 * follows: re-reading a two-year-old invoice must show what the customer was
 * actually charged, whatever the price list says today.
 */
export async function createInvoiceFromOrder(salesOrderId: string): Promise<void> {
  const user = await requirePermission('invoices.write');

  const order = await prisma.salesOrder.findFirst({
    where: { id: salesOrderId, tenantId: user.tenantId, isDeleted: false },
    include: {
      lines: {
        orderBy: { lineNo: 'asc' },
        include: {
          product: { select: { nameAr: true } },
          variant: {
            include: { color: { select: { nameAr: true } }, size: { select: { code: true } } },
          },
        },
      },
    },
  });
  if (!order) redirect('/sales/orders');
  if (order.status === 'DRAFT' || order.status === 'CANCELLED') {
    redirect(`/sales/orders/${salesOrderId}?err=not-confirmed`);
  }
  if (order.lines.length === 0) redirect(`/sales/orders/${salesOrderId}?err=empty`);

  const settings = await invoiceSettings(user.tenantId);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: user.tenantId,
      customerId: order.customerId,
      salesOrderId: order.id,
      status: 'DRAFT',
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      taxAmount: order.taxAmount,
      total: order.total,
      createdById: user.id,
      lines: {
        create: order.lines.map((l) => ({
          lineNo: l.lineNo,
          productId: l.productId,
          variantId: l.variantId,
          // Frozen wording: the product may be renamed, the invoice may not.
          description: [l.product.nameAr, l.variant.color?.nameAr, l.variant.size?.code]
            .filter(Boolean)
            .join(' · '),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxRate: l.taxRate,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        })),
      },
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'invoice.create',
    entityType: 'Invoice',
    entityId: invoice.id,
    detail: `from ${order.number} (${settings.currency})`,
  });

  revalidatePath('/invoices');
  redirect(`/invoices/${invoice.id}`);
}

/**
 * Issue the invoice.
 *
 * This is the moment the number is allocated, gaplessly, inside the same
 * transaction that sets the status — so a failure returns the number instead
 * of burning it.
 */
export async function issueInvoice(id: string): Promise<void> {
  const user = await requirePermission('invoices.issue');

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { _count: { select: { lines: true } } },
  });
  if (!invoice) redirect('/invoices');
  if (invoice.status !== 'DRAFT') redirect(`/invoices/${id}`);
  // An invoice with no lines would burn a sequence number to say nothing.
  if (invoice._count.lines === 0) redirect(`/invoices/${id}?err=empty`);

  const settings = await invoiceSettings(user.tenantId);
  const issuedAt = new Date();

  const number = await tenantTransaction(async (tx) => {
    const allocated = await allocateInvoiceNumber(tx, user.tenantId, settings.prefix);
    await tx.invoice.update({
      where: { id },
      data: {
        number: allocated,
        status: 'ISSUED',
        issueDate: issuedAt,
        dueDate: dueDate(issuedAt, settings.termDays),
        issuedById: user.id,
      },
    });
    return allocated;
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'invoice.issue',
    entityType: 'Invoice',
    entityId: id,
    detail: number,
  });

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${id}`);
}

const VoidSchema = z.object({
  reason: z.string().trim().min(5, 'سبب الإلغاء مطلوب.').max(500),
});

/**
 * Void an invoice.
 *
 * Never deleted, and the number is never reused: it has already been
 * reported. A void invoice stays in the sequence as evidence that nothing was
 * skipped — which is the entire point of gapless numbering.
 */
export async function voidInvoice(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('invoices.issue');
  const parsed = VoidSchema.safeParse({ reason: String(formData.get('reason') ?? '') });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { payments: { where: { reversesId: null } } },
  });
  if (!invoice || !isInvoiceStatus(invoice.status)) return { error: 'الفاتورة غير موجودة.' };
  if (!INVOICE_TRANSITIONS[invoice.status].includes('VOID')) {
    return { error: 'لا يمكن إلغاء فاتورة مدفوعة بالكامل.' };
  }
  // Voiding an invoice that has taken money would leave the payment pointing
  // at nothing collectable.
  if (invoice.payments.length > 0) {
    return { error: 'اعكس الدفعات أولاً — لا تُلغى فاتورة استلمت مبالغ.' };
  }

  await prisma.invoice.update({
    where: { id },
    data: { status: 'VOID', voidReason: parsed.data.reason, voidedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'invoice.void',
    entityType: 'Invoice',
    entityId: id,
    detail: `${invoice.number ?? 'draft'} — ${parsed.data.reason}`,
  });

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${id}`);
  return { ok: 'تم إلغاء الفاتورة.' };
}

// ── Payments ────────────────────────────────────────────────

const PaymentSchema = z.object({
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر.'),
  method: z.string().refine(isPaymentMethod, 'طريقة سداد غير معروفة.'),
  paidAt: z.string().optional(),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

/**
 * Record a payment.
 *
 * The invoice status is derived from the payments afterwards, never typed —
 * an invoice claiming to be paid without a payment behind it is the start of
 * a dispute.
 */
export async function recordPayment(
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('payments.record');
  const parsed = PaymentSchema.safeParse({
    amount: String(formData.get('amount') ?? ''),
    method: String(formData.get('method') ?? ''),
    paidAt: String(formData.get('paidAt') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: user.tenantId, isDeleted: false },
  });
  if (!invoice) return { error: 'الفاتورة غير موجودة.' };
  if (invoice.status === 'DRAFT') return { error: 'أصدر الفاتورة أولاً.' };
  if (invoice.status === 'VOID') return { error: 'الفاتورة ملغاة.' };

  if (exceedsBalance(parsed.data.amount, invoice.total, invoice.paidAmount)) {
    return {
      fieldErrors: {
        amount: `المبلغ يتجاوز المتبقي (${balance(invoice.total, invoice.paidAmount).toString()}).`,
      },
    };
  }

  const number = await nextPaymentNumber(user.tenantId);
  const paidAtDate = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();

  await tenantTransaction(async (tx) => {
    await tx.payment.create({
      data: {
        tenantId: user.tenantId,
        number,
        invoiceId,
        amount: parsed.data.amount,
        method: parsed.data.method,
        paidAt: Number.isNaN(paidAtDate.getTime()) ? new Date() : paidAtDate,
        reference: parsed.data.reference || null,
        notes: parsed.data.notes || null,
        recordedById: user.id,
      },
    });

    const paid = dec(invoice.paidAmount).plus(dec(parsed.data.amount));
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: paid.toString(),
        status: deriveInvoiceStatus(invoice.total, paid, invoice.status as never),
      },
    });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'payment.record',
    entityType: 'Invoice',
    entityId: invoiceId,
    detail: `${number} ${parsed.data.amount}`,
  });

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: `تم تسجيل الدفعة ${number}.` };
}

/**
 * Reverse a payment.
 *
 * A reversing payment that points at the original, never an edit or a delete.
 * Money that moved and then un-moved is a fact, and the ledger says so.
 */
export async function reversePayment(invoiceId: string, paymentId: string): Promise<void> {
  const user = await requirePermission('payments.record');

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId: user.tenantId, invoiceId },
    include: { reversedBy: true, invoice: true },
  });
  if (!payment) redirect(`/invoices/${invoiceId}`);
  if (payment.reversedBy || payment.reversesId) redirect(`/invoices/${invoiceId}`);

  const number = await nextPaymentNumber(user.tenantId);

  await tenantTransaction(async (tx) => {
    await tx.payment.create({
      data: {
        tenantId: user.tenantId,
        number,
        invoiceId,
        amount: dec(payment.amount).negated().toString(),
        method: payment.method,
        paidAt: new Date(),
        notes: `عكس الدفعة ${payment.number}`,
        reversesId: payment.id,
        recordedById: user.id,
      },
    });

    const paid = dec(payment.invoice.paidAmount).minus(dec(payment.amount));
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: paid.toString(),
        status: deriveInvoiceStatus(
          payment.invoice.total,
          paid,
          payment.invoice.status as never,
        ),
      },
    });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'payment.reverse',
    entityType: 'Invoice',
    entityId: invoiceId,
    detail: `${number} reverses ${payment.number}`,
  });

  revalidatePath(`/invoices/${invoiceId}`);
}
