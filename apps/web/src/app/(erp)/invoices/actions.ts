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
  calcLine,
  calcDocument,
  dec,
  can,
  isOrderSource,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { readLines, decimal } from '@/app/(erp)/sales/shared';
import {
  allocateInvoiceNumber,
  nextPaymentNumber,
  invoiceSettings,
  type FormState,
} from './shared';

/**
 * إنشاء فاتورة مبيعات مباشرة — عميل ومنتجات وكميات، بلا عرض سعر ولا أمر بيع.
 *
 * هذا ما يحتاجه البيع اليومي: فاتورة كاملة في خطوة واحدة. تُنشأ مسوّدة ثم
 * تُصدَّر من صفحتها (هناك يُخصَّص الرقم المتسلسل بلا فجوات كأي فاتورة).
 * الأسعار تُنسخ لحظة الإنشاء فتبقى الفاتورة شاهدةً على ما دُفع فعلاً.
 */
export async function createSalesInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('invoices.write');

  const customerId = String(formData.get('customerId') ?? '').trim();
  if (!customerId) return { fieldErrors: { customerId: 'العميل مطلوب.' } };

  // طلب موقع مصدر هذه الفاتورة، إن وُجد — يُوسَم «تحوّل» بعد الإنشاء.
  const webOrderId = String(formData.get('webOrderId') ?? '').trim() || null;
  const markWebOrder = async (invoiceId: string) => {
    if (!webOrderId) return;
    await prisma.webOrder.updateMany({
      where: { id: webOrderId, tenantId: user.tenantId, status: 'PENDING' },
      data: { status: 'CONVERTED', invoiceId },
    });
    revalidatePath('/sales/web-orders');
  };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true },
  });
  if (!customer) return { fieldErrors: { customerId: 'العميل غير موجود.' } };

  const rawLines = readLines(formData);
  if (rawLines.length === 0) return { error: 'أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.' };

  // المتغيّرات لبناء الوصف المجمّد ومعرفة المنتج — مقصورة على مستأجر المستخدم.
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: rawLines.map((l) => l.variantId) }, product: { tenantId: user.tenantId } },
    include: {
      product: { select: { nameAr: true } },
      color: { select: { nameAr: true } },
      size: { select: { code: true } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  if (rawLines.some((l) => !byId.has(l.variantId))) {
    return { error: 'أحد الأصناف غير صالح. أعد اختيار المنتج.' };
  }

  const docDiscount = decimal(formData.get('discountAmount'));
  const docDiscountPct = decimal(formData.get('discountPercent'));

  const computed = rawLines.map((l) => calcLine(l));
  const totals = calcDocument(computed, {
    discountAmount: docDiscount,
    discountPercent: docDiscountPct,
  });

  const notes = String(formData.get('notes') ?? '').trim() || null;
  const lineData = rawLines.map((l, i) => {
    const v = byId.get(l.variantId)!;
    const t = computed[i];
    return {
      lineNo: i + 1,
      productId: v.productId,
      variantId: v.id,
      description: [v.product.nameAr, v.color?.nameAr, v.size?.code].filter(Boolean).join(' · '),
      quantity: dec(l.quantity).toString(),
      unitPrice: dec(l.unitPrice).toString(),
      discountAmount: dec(l.discountAmount).toString(),
      taxRate: dec(l.taxRate).toString(),
      taxAmount: t.taxAmount.toString(),
      lineTotal: t.lineTotal.toString(),
    };
  });

  // مصدر الطلب: يدويّ من الفورم، أو «الموقع» تلقائياً لطلب موقع، وإلا لا شيء.
  const sourceRaw = String(formData.get('source') ?? '').trim();
  const source = isOrderSource(sourceRaw) ? sourceRaw : webOrderId ? 'SITE' : null;

  const baseData = {
    tenantId: user.tenantId,
    customerId,
    subtotal: totals.subtotal.toString(),
    discountAmount: totals.discountAmount.toString(),
    taxAmount: totals.taxAmount.toString(),
    total: totals.total.toString(),
    notes,
    source,
    createdById: user.id,
    lines: { create: lineData },
  };

  // ── إصدار وتحصيل فوري (اختياري) ─────────────────────────────
  // العميل الذي يدفع فوراً لا يحتاج ثلاث خطوات: نُنشئ الفاتورة، ونُصدرها
  // (فيُخصَّص رقمها المتسلسل داخل نفس المعاملة كأي إصدار)، ونُسجّل الدفعة —
  // كلها في معاملة واحدة تحفظ الانضباط: لا رقم يُحرق، ولا دفعة على مسوّدة.
  const issueNow = ['1', 'on', 'true'].includes(String(formData.get('issueNow') ?? ''));

  if (issueNow) {
    if (!can(user.role, 'invoices.issue')) {
      return { error: 'لا تملك صلاحية إصدار الفواتير — احفظها كمسوّدة ثم اطلب إصدارها.' };
    }

    const payAmount = dec(decimal(formData.get('paymentAmount')));
    const payMethodRaw = String(formData.get('paymentMethod') ?? 'CASH');
    const wantsPayment = payAmount.gt(0);

    if (wantsPayment) {
      if (!can(user.role, 'payments.record')) {
        return { error: 'لا تملك صلاحية تسجيل الدفعات.' };
      }
      if (!isPaymentMethod(payMethodRaw)) {
        return { fieldErrors: { paymentMethod: 'طريقة سداد غير معروفة.' } };
      }
      if (exceedsBalance(payAmount, totals.total, 0)) {
        return {
          fieldErrors: { paymentAmount: `المبلغ المدفوع يتجاوز إجمالي الفاتورة (${totals.total.toString()}).` },
        };
      }
    }

    const settings = await invoiceSettings(user.tenantId);
    const issuedAt = new Date();
    const paymentNumber = wantsPayment ? await nextPaymentNumber(user.tenantId) : null;
    // فاتورة مباشرة تصرف بضاعتها من المخزون فور إصدارها — كالكاشير.
    const warehouseId = await defaultWarehouseId(user.tenantId);
    const stockLines = rawLines.map((l) => ({
      productId: byId.get(l.variantId)!.productId,
      variantId: l.variantId,
      quantity: l.quantity,
    }));

    const created = await tenantTransaction(async (tx) => {
      const number = await allocateInvoiceNumber(tx, user.tenantId, settings.prefix);
      const status = wantsPayment
        ? deriveInvoiceStatus(totals.total, payAmount, 'ISSUED' as never)
        : 'ISSUED';
      const inv = await tx.invoice.create({
        data: {
          ...baseData,
          number,
          status,
          issueDate: issuedAt,
          dueDate: dueDate(issuedAt, settings.termDays),
          issuedById: user.id,
          paidAmount: wantsPayment ? payAmount.toString() : '0',
        },
      });
      if (wantsPayment) {
        await tx.payment.create({
          data: {
            tenantId: user.tenantId,
            number: paymentNumber!,
            invoiceId: inv.id,
            amount: payAmount.toString(),
            method: payMethodRaw,
            paidAt: issuedAt,
            recordedById: user.id,
          },
        });
      }
      if (warehouseId) {
        await issueStockOut(tx, user.tenantId, user.id, warehouseId, number, stockLines);
      }
      return inv;
    });

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'invoice.create',
      entityType: 'Invoice',
      entityId: created.id,
      detail: `فاتورة مباشرة — إصدار${wantsPayment ? ` وتحصيل ${payAmount.toString()}` : ''} فوري (${created.number})`,
    });

    await markWebOrder(created.id);
    revalidatePath('/invoices');
    redirect(`/invoices/${created.id}`);
  }

  // المسار الافتراضي: مسوّدة تُصدَّر لاحقاً من صفحتها.
  const invoice = await prisma.invoice.create({
    data: { ...baseData, status: 'DRAFT' },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'invoice.create',
    entityType: 'Invoice',
    entityId: invoice.id,
    detail: 'فاتورة مبيعات مباشرة',
  });

  await markWebOrder(invoice.id);
  revalidatePath('/invoices');
  redirect(`/invoices/${invoice.id}`);
}

/** المخزن الافتراضي للمستأجر — لتسوية المخزون عند تعديل بنود الفاتورة. */
async function defaultWarehouseId(tenantId: string): Promise<string | null> {
  const wh = await prisma.warehouse.findFirst({
    where: { tenantId, isDeleted: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  });
  return wh?.id ?? null;
}

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/**
 * صرف بضاعة فاتورة من المخزون — حركة ISSUE سالبة + نقص onHand لكل بند، كبيع
 * الكاشير. تُستدعى لحظة إصدار فاتورة مباشرة (بلا أمر بيع) فيبقى الجرد دقيقاً
 * لكل بيع لا للكاشير وحده. الأصناف بلا متغيّر/منتج أو بكمية صفر تُتجاوز.
 */
async function issueStockOut(
  tx: Tx,
  tenantId: string,
  userId: string,
  warehouseId: string,
  reference: string | null,
  lines: { productId: string | null; variantId: string | null; quantity: Parameters<typeof dec>[0] }[],
): Promise<void> {
  for (const l of lines) {
    if (!l.variantId || !l.productId) continue;
    const qty = dec(l.quantity);
    if (qty.lte(0)) continue;
    await tx.stockMovement.create({
      data: {
        tenantId,
        productId: l.productId,
        variantId: l.variantId,
        warehouseId,
        type: 'ISSUE',
        quantity: qty.negated().toString(),
        reference,
        reason: 'صرف بضاعة فاتورة',
        userId,
      },
    });
    const st = await tx.stock.findFirst({ where: { variantId: l.variantId, warehouseId, locationId: null } });
    if (st) {
      await tx.stock.update({ where: { id: st.id }, data: { onHand: dec(st.onHand).minus(qty).toString() } });
    } else {
      await tx.stock.create({ data: { variantId: l.variantId, warehouseId, onHand: qty.negated().toString() } });
    }
  }
}

/** عكس الصرف — إرجاع بضاعة فاتورة للمخزون عند إلغائها (حركة RETURN موجبة). */
async function restockIn(
  tx: Tx,
  tenantId: string,
  userId: string,
  warehouseId: string,
  reference: string | null,
  lines: { productId: string | null; variantId: string | null; quantity: Parameters<typeof dec>[0] }[],
): Promise<void> {
  for (const l of lines) {
    if (!l.variantId || !l.productId) continue;
    const qty = dec(l.quantity);
    if (qty.lte(0)) continue;
    await tx.stockMovement.create({
      data: {
        tenantId,
        productId: l.productId,
        variantId: l.variantId,
        warehouseId,
        type: 'RETURN',
        quantity: qty.toString(),
        reference,
        reason: 'إلغاء فاتورة — إرجاع للمخزون',
        userId,
      },
    });
    const st = await tx.stock.findFirst({ where: { variantId: l.variantId, warehouseId, locationId: null } });
    if (st) {
      await tx.stock.update({ where: { id: st.id }, data: { onHand: dec(st.onHand).plus(qty).toString() } });
    } else {
      await tx.stock.create({ data: { variantId: l.variantId, warehouseId, onHand: qty.toString() } });
    }
  }
}

/**
 * تعديل بنود فاتورة قائمة — تغيير الأعداد وإضافة/حذف أصناف على نفس فاتورة
 * العميل بدل إنشاء فاتورة جديدة.
 *
 * تُعاد الحسبة بالكامل (الإجمالي والحالة تُشتقّ من المدفوع مقابل الإجمالي
 * الجديد)، ويُطبَّق **فرق** المخزون فقط: ما زاد يُصرَف وما نقص يعود — فيبقى
 * المخزون مطابقاً لما خرج فعلاً (كبيع الكاشير). الفاتورة الملغاة لا تُعدَّل،
 * والمسوّدة لا تمسّ المخزون (لم تُصرَف بعد).
 */
export async function updateInvoiceLines(
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('invoices.write');

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: user.tenantId, isDeleted: false },
    include: { lines: { select: { variantId: true, productId: true, quantity: true } } },
  });
  if (!invoice) return { error: 'الفاتورة غير موجودة.' };
  if (invoice.status === 'VOID') return { error: 'الفاتورة ملغاة — لا تُعدَّل.' };

  const rawLines = readLines(formData);
  if (rawLines.length === 0) return { error: 'أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.' };

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: rawLines.map((l) => l.variantId) }, product: { tenantId: user.tenantId } },
    include: {
      product: { select: { nameAr: true } },
      color: { select: { nameAr: true } },
      size: { select: { code: true } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  if (rawLines.some((l) => !byId.has(l.variantId))) {
    return { error: 'أحد الأصناف غير صالح. أعد اختيار المنتج.' };
  }

  const docDiscount = decimal(formData.get('discountAmount'));
  const docDiscountPct = decimal(formData.get('discountPercent'));
  const computed = rawLines.map((l) => calcLine(l));
  const totals = calcDocument(computed, { discountAmount: docDiscount, discountPercent: docDiscountPct });

  const notes = String(formData.get('notes') ?? '').trim() || null;
  const lineData = rawLines.map((l, i) => {
    const v = byId.get(l.variantId)!;
    const t = computed[i];
    return {
      lineNo: i + 1,
      productId: v.productId,
      variantId: v.id,
      description: [v.product.nameAr, v.color?.nameAr, v.size?.code].filter(Boolean).join(' · '),
      quantity: dec(l.quantity).toString(),
      unitPrice: dec(l.unitPrice).toString(),
      discountAmount: dec(l.discountAmount).toString(),
      taxRate: dec(l.taxRate).toString(),
      taxAmount: t.taxAmount.toString(),
      lineTotal: t.lineTotal.toString(),
    };
  });

  // فرق الكمية لكل متغيّر: الجديد ناقص القديم. موجب ⇒ خرج أكثر (يُخصَم)،
  // سالب ⇒ رجع (يُضاف). خريطة المنتج للمتغيّر من الجديد والقديم معاً.
  const productOf = new Map<string, string>();
  const oldQty = new Map<string, ReturnType<typeof dec>>();
  for (const l of invoice.lines) {
    if (!l.variantId) continue;
    if (l.productId) productOf.set(l.variantId, l.productId);
    oldQty.set(l.variantId, (oldQty.get(l.variantId) ?? dec(0)).plus(dec(l.quantity)));
  }
  const newQty = new Map<string, ReturnType<typeof dec>>();
  for (const l of rawLines) {
    const v = byId.get(l.variantId)!;
    productOf.set(l.variantId, v.productId);
    newQty.set(l.variantId, (newQty.get(l.variantId) ?? dec(0)).plus(dec(l.quantity)));
  }

  // المسوّدة لم تُصرَف بعد، فلا تمسّ المخزون؛ غيرها يُسوّى بالفرق.
  const touchStock = invoice.status !== 'DRAFT';
  const warehouseId = touchStock ? await defaultWarehouseId(user.tenantId) : null;

  const newStatus =
    invoice.status === 'DRAFT'
      ? 'DRAFT'
      : deriveInvoiceStatus(totals.total, dec(invoice.paidAmount), invoice.status as never);

  await tenantTransaction(async (tx) => {
    await tx.invoiceLine.deleteMany({ where: { invoiceId } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        subtotal: totals.subtotal.toString(),
        discountAmount: totals.discountAmount.toString(),
        taxAmount: totals.taxAmount.toString(),
        total: totals.total.toString(),
        notes,
        status: newStatus,
        lines: { create: lineData },
      },
    });

    if (warehouseId) {
      const variantIds = new Set([...oldQty.keys(), ...newQty.keys()]);
      for (const vid of variantIds) {
        const delta = (newQty.get(vid) ?? dec(0)).minus(oldQty.get(vid) ?? dec(0));
        if (delta.isZero()) continue;
        const productId = productOf.get(vid);
        if (!productId) continue; // لا حركة مخزون بلا منتج معروف
        await tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId,
            variantId: vid,
            warehouseId,
            type: delta.gt(0) ? 'ISSUE' : 'RECEIPT',
            quantity: delta.negated().toString(), // خصم موجب ⇒ كمية سالبة
            reference: invoice.number ?? undefined,
            reason: 'تعديل بنود الفاتورة',
            userId: user.id,
          },
        });
        const stock = await tx.stock.findFirst({ where: { variantId: vid, warehouseId, locationId: null } });
        if (stock) {
          await tx.stock.update({ where: { id: stock.id }, data: { onHand: dec(stock.onHand).minus(delta).toString() } });
        } else {
          await tx.stock.create({ data: { variantId: vid, warehouseId, onHand: delta.negated().toString() } });
        }
      }
    }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'invoice.editLines',
    entityType: 'Invoice',
    entityId: invoiceId,
    detail: `${invoice.number ?? 'مسودة'} — ${lineData.length} بند · إجمالي ${totals.total.toString()}`,
  });

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}`);
}

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
    include: { lines: { select: { productId: true, variantId: true, quantity: true } } },
  });
  if (!invoice) redirect('/invoices');
  if (invoice.status !== 'DRAFT') redirect(`/invoices/${id}`);
  // An invoice with no lines would burn a sequence number to say nothing.
  if (invoice.lines.length === 0) redirect(`/invoices/${id}?err=empty`);

  const settings = await invoiceSettings(user.tenantId);
  const issuedAt = new Date();
  // فاتورة مباشرة (بلا أمر بيع) تصرف بضاعتها الآن — أمّا فواتير الأوامر فمخزونها
  // محجوز/مُدار عبر الحجز، فلا تُصرَف هنا كي لا يُخصم مرّتين.
  const warehouseId = invoice.salesOrderId ? null : await defaultWarehouseId(user.tenantId);

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
    if (warehouseId) {
      await issueStockOut(tx, user.tenantId, user.id, warehouseId, allocated, invoice.lines);
    }
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
    include: {
      payments: { where: { reversesId: null } },
      lines: { select: { productId: true, variantId: true, quantity: true } },
    },
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

  // فاتورة مباشرة صُرفت بضاعتها عند الإصدار — إلغاؤها يعيدها للمخزون. المسوّدة
  // لم تُصرَف، وفاتورة الأمر مخزونها مُدار عبر الحجز، فلا تُرَدّ هنا.
  const restockWh =
    invoice.status !== 'DRAFT' && !invoice.salesOrderId ? await defaultWarehouseId(user.tenantId) : null;

  await tenantTransaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: { status: 'VOID', voidReason: parsed.data.reason, voidedAt: new Date() },
    });
    if (restockWh) {
      await restockIn(tx, user.tenantId, user.id, restockWh, invoice.number ?? null, invoice.lines);
    }
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
