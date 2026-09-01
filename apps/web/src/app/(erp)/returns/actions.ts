'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { num } from '@/lib/num';
import type { FormState } from '@/lib/ops';
import { lockPaymentSequence, nextPaymentNumber } from '@/app/(erp)/invoices/shared';

/** رقم مرتجع متسلسل للسنة: RET-YYYY-N. */
async function nextReturnNumber(tenantId: string): Promise<string> {
  const stem = `RET-${new Date().getFullYear()}-`;
  const rows = await prisma.salesReturn.findMany({
    where: { tenantId, number: { startsWith: stem } },
    select: { number: true },
  });
  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.number.slice(stem.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `${stem}${max + 1}`;
}

async function defaultWarehouseId(tenantId: string): Promise<string | null> {
  const wh = await prisma.warehouse.findFirst({
    where: { tenantId, isDeleted: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  });
  return wh?.id ?? null;
}

/**
 * تسجيل مرتجع مبيعات من فاتورة — الزبون يرجّع أصنافاً، فترجع للمخزون، ويُخصم
 * قيمتها من مبيعات المندوب (منشئ الفاتورة) في تحليله.
 *
 * الكمية المرتجعة لكل بند لا تتجاوز المباع. المخزون يُزاد بحركة RETURN، وقيمة
 * المرتجع لقطة من سعر البيع لحظتها.
 */
export async function createReturn(
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('returns.write');

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
    include: {
      lines: true,
      customer: { select: { companyName: true, contactName: true } },
    },
  });
  if (!invoice) return { error: 'الفاتورة غير موجودة أو غير صالحة للإرجاع.' };

  // المرتجَع سابقاً لكل بند من هذه الفاتورة — لمنع تجاوز المباع عبر عدة مرتجعات.
  const priorReturns = await prisma.salesReturn.findMany({
    where: { tenantId: user.tenantId, invoiceId: invoice.id, isDeleted: false },
    select: { totalAmount: true, lines: { select: { invoiceLineId: true, quantity: true } } },
  });
  const returnedByLine = new Map<string, ReturnType<typeof dec>>();
  for (const pr of priorReturns) {
    for (const l of pr.lines) {
      if (!l.invoiceLineId) continue;
      returnedByLine.set(l.invoiceLineId, (returnedByLine.get(l.invoiceLineId) ?? dec(0)).plus(dec(l.quantity)));
    }
  }

  const retLines: { line: (typeof invoice.lines)[number]; qty: number }[] = [];
  for (const l of invoice.lines) {
    const q = Math.max(0, num(formData.get(`qty_${l.id}`)));
    if (q <= 0) continue;
    const prior = returnedByLine.get(l.id) ?? dec(0);
    const remaining = dec(l.quantity).minus(prior);
    if (dec(q).gt(remaining)) {
      return { error: `الكمية المرتجعة لصنف «${l.description}» تتجاوز المتبقّي للإرجاع (${remaining.toString()} من ${dec(l.quantity).toString()}).` };
    }
    retLines.push({ line: l, qty: q });
  }
  if (retLines.length === 0) return { error: 'أدخل كمية مرتجعة لصنف واحد على الأقل.' };

  // سبب الإرجاع إلزامي (بطلب المالك) — مرتجع بلا سبب لا يُقبل.
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) return { error: 'سبب الإرجاع إلزامي — اكتب لماذا رجّع العميل البضاعة.' };

  // قيمة المرتجع بما دفعه العميل فعلاً، لا بسعر السطر الإجمالي:
  // سعر الوحدة من lineTotal (بعد خصم السطر) × نسبة ما بقي بعد خصم الفاتورة
  // الكلي. الحساب القديم كان يردّ سعر ما قبل الخصومات — نقد يخرج زيادة.
  const subtotal = dec(invoice.subtotal);
  let docRatio = dec(1);
  if (subtotal.gt(0)) {
    docRatio = subtotal.minus(dec(invoice.discountAmount)).dividedBy(subtotal);
    if (docRatio.lt(0)) docRatio = dec(0);
    if (docRatio.gt(1)) docRatio = dec(1);
  }
  const effectiveUnit = (line: (typeof invoice.lines)[number]) =>
    dec(line.lineTotal).dividedBy(dec(line.quantity)).times(docRatio).toDecimalPlaces(4);
  const total = retLines
    .reduce((s, r) => s.plus(effectiveUnit(r.line).times(dec(r.qty))), dec(0))
    .toDecimalPlaces(4);
  const number = await nextReturnNumber(user.tenantId);
  const warehouseId = await defaultWarehouseId(user.tenantId);

  // قيمة كل المرتجعات السابقة — لاشتقاق ما بقي مستحقاً على الفاتورة بعد هذا
  // المرتجع، فلا تعود فاتورةٌ مدفوعة تظهر ديناً على عميلٍ أرجع بضاعته.
  const priorReturnedValue = priorReturns.reduce((s, pr) => s.plus(dec(pr.totalAmount)), dec(0));

  // رد المبلغ للعميل (اختياري، افتراضياً نعم) — لا يتجاوز ما دُفع فعلاً على
  // الفاتورة. يُسجَّل كدفعة سالبة تُنقص المدفوع وتُعيد اشتقاق حالة الفاتورة.
  const refundWanted = ['1', 'on', 'true'].includes(String(formData.get('refund') ?? ''));
  const paid = dec(invoice.paidAmount);
  const refundAmount = refundWanted && paid.gt(0) ? (total.gt(paid) ? paid : total) : dec(0);

  await tenantTransaction(async (tx) => {
    await tx.salesReturn.create({
      data: {
        tenantId: user.tenantId,
        number,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        customerId: invoice.customerId,
        customerName: invoice.customer.companyName ?? invoice.customer.contactName,
        reason,
        totalAmount: total.toString(),
        createdById: user.id,
        lines: {
          create: retLines.map((r) => ({
            invoiceLineId: r.line.id,
            productId: r.line.productId,
            variantId: r.line.variantId,
            description: r.line.description,
            quantity: dec(r.qty).toString(),
            // السعر الفعلي بعد كل الخصومات — ما دفعه العميل للوحدة حقاً.
            unitPrice: effectiveUnit(r.line).toString(),
            lineTotal: effectiveUnit(r.line).times(dec(r.qty)).toDecimalPlaces(4).toString(),
          })),
        },
      },
    });

    // إعادة البضاعة للمخزون بحركة RETURN موجبة.
    if (warehouseId) {
      for (const r of retLines) {
        if (!r.line.variantId || !r.line.productId) continue;
        await tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId: r.line.productId,
            variantId: r.line.variantId,
            warehouseId,
            type: 'RETURN',
            quantity: dec(r.qty).toString(),
            reference: number,
            reason: 'مرتجع مبيعات',
            userId: user.id,
          },
        });
        const st = await tx.stock.findFirst({ where: { variantId: r.line.variantId, warehouseId, locationId: null } });
        if (st) {
          await tx.stock.update({ where: { id: st.id }, data: { onHand: dec(st.onHand).plus(dec(r.qty)).toString() } });
        } else {
          await tx.stock.create({ data: { variantId: r.line.variantId, warehouseId, onHand: dec(r.qty).toString() } });
        }
      }
    }

    // رد المبلغ نقداً: دفعة سالبة على الفاتورة تُنقص المدفوع — رقمها داخل
    // المعاملة وخلف قفل تسلسل الدفعات، فلا يتكرر مع تحصيل متزامن.
    if (refundAmount.gt(0)) {
      await lockPaymentSequence(tx, user.tenantId);
      const paymentNumber = await nextPaymentNumber(user.tenantId, tx);
      await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          number: paymentNumber,
          invoiceId: invoice.id,
          amount: refundAmount.negated().toString(),
          method: 'CASH',
          paidAt: new Date(),
          notes: `رد مرتجع ${number}`,
          recordedById: user.id,
        },
      });
    }

    // حالة الفاتورة بعد المرتجع تُشتق من المستحق الصافي (الإجمالي − كل
    // المرتجعات) مقابل المدفوع الجديد — فمرتجعٌ كامل مردود المبلغ يترك
    // الفاتورة PAID لا ديناً وهمياً يظهر في تقارير الذمم.
    const newPaid = refundAmount.gt(0) ? paid.minus(refundAmount) : paid;
    const owedAfterReturns = dec(invoice.total).minus(priorReturnedValue).minus(total);
    const newStatus =
      invoice.status === 'DRAFT' || invoice.status === 'VOID'
        ? invoice.status
        : owedAfterReturns.lte(newPaid)
          ? 'PAID'
          : newPaid.lte(0)
            ? 'ISSUED'
            : 'PARTIALLY_PAID';
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaid.toString(), status: newStatus },
    });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'return.create',
    entityType: 'SalesReturn',
    entityId: invoice.id,
    detail: `${number} — ${invoice.number ?? ''} · ${total.toString()}${refundAmount.gt(0) ? ` · رد ${refundAmount.toString()}` : ''}`,
  });

  revalidatePath('/returns');
  revalidatePath('/inventory');
  revalidatePath(`/invoices/${invoice.id}`);
  redirect('/returns');
}

/** حذف مرتجع (ناعم) — لا يعكس المخزون تلقائياً؛ صُحّح بحركة يدوية إن لزم. */
export async function deleteReturn(id: string): Promise<void> {
  const user = await requirePermission('returns.write');
  const ret = await prisma.salesReturn.findFirst({ where: { id, tenantId: user.tenantId, isDeleted: false }, select: { id: true, number: true } });
  if (!ret) redirect('/returns');
  await prisma.salesReturn.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'return.delete', entityType: 'SalesReturn', entityId: id, detail: ret.number });
  revalidatePath('/returns');
  redirect('/returns');
}
