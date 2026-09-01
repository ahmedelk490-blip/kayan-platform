'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { dec, dueDate, deriveInvoiceStatus, exceedsBalance, isPaymentMethod, can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { num } from '@/lib/num';
import { allocateInvoiceNumber, nextPaymentNumber, invoiceSettings, type FormState } from '../invoices/shared';

/**
 * إتمام بيع الكاشير — فاتورة مُصدَرة ومُحصَّلة تخصم المخزون، في معاملة واحدة.
 *
 * على عكس فاتورة المسوّدة العادية، بيع الكاشير حدثٌ ماديّ في المتجر: يُصدر
 * الفاتورة، يسجّل الدفعة، ويصرف البضاعة من المخزن (حركة ISSUE ونقص onHand).
 * فتظهر البيعة في المخزون وعند المدير (يرى فواتير الكل) فوراً.
 */
export async function cashierCheckout(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('invoices.write');
  if (!can(user.role, 'invoices.issue') || !can(user.role, 'payments.record')) {
    return { error: 'تحتاج صلاحيتَي الإصدار والتحصيل لإتمام البيع.' };
  }

  const customerId = String(formData.get('customerId') ?? '').trim();
  const warehouseId = String(formData.get('warehouseId') ?? '').trim();
  if (!customerId) return { fieldErrors: { customerId: 'اختر العميل.' } };
  if (!warehouseId) return { error: 'لا يوجد مخزن للصرف منه.' };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true },
  });
  if (!customer) return { fieldErrors: { customerId: 'العميل غير موجود.' } };

  // السطور: متغيّر + كمية + سعر وحدة (مصفوفات متوازية).
  const variantIds = formData.getAll('lineVariantId').map(String);
  const quantities = formData.getAll('lineQuantity').map((v) => Math.max(1, Math.round(num(v))));
  const unitPrices = formData.getAll('lineUnitPrice').map((v) => num(v));
  const rawLines = variantIds
    .map((variantId, i) => ({ variantId, quantity: quantities[i] ?? 1, unitPrice: unitPrices[i] ?? 0 }))
    .filter((l) => l.variantId && l.quantity > 0);
  if (rawLines.length === 0) return { error: 'أضِف صنفاً واحداً على الأقل.' };

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: rawLines.map((l) => l.variantId) }, product: { tenantId: user.tenantId } },
    include: {
      product: { select: { nameAr: true } },
      color: { select: { nameAr: true } },
      size: { select: { code: true } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  if (rawLines.some((l) => !byId.has(l.variantId))) return { error: 'أحد الأصناف غير صالح.' };

  const computed = rawLines.map((l) => ({ ...l, lineTotal: dec(l.quantity).times(dec(l.unitPrice)) }));
  const total = computed.reduce((s, l) => s.plus(l.lineTotal), dec(0));

  const payAmount = dec(num(formData.get('paymentAmount')));
  const payMethod = String(formData.get('paymentMethod') ?? 'CASH');
  const wantsPayment = payAmount.gt(0);
  if (wantsPayment) {
    if (!isPaymentMethod(payMethod)) return { fieldErrors: { paymentMethod: 'طريقة سداد غير معروفة.' } };
    if (exceedsBalance(payAmount, total, 0)) {
      return { fieldErrors: { paymentAmount: `المبلغ يتجاوز الإجمالي (${total.toString()}).` } };
    }
  }

  const settings = await invoiceSettings(user.tenantId);
  const issuedAt = new Date();
  const paymentNumber = wantsPayment ? await nextPaymentNumber(user.tenantId) : null;

  const created = await tenantTransaction(async (tx) => {
    const number = await allocateInvoiceNumber(tx, user.tenantId, settings.prefix);
    const status = wantsPayment ? deriveInvoiceStatus(total, payAmount, 'ISSUED' as never) : 'ISSUED';
    const inv = await tx.invoice.create({
      data: {
        tenantId: user.tenantId,
        customerId,
        number,
        status,
        subtotal: total.toString(),
        discountAmount: '0',
        taxAmount: '0',
        total: total.toString(),
        source: 'CASHIER',
        issueDate: issuedAt,
        dueDate: dueDate(issuedAt, settings.termDays),
        issuedById: user.id,
        createdById: user.id,
        paidAmount: wantsPayment ? payAmount.toString() : '0',
        lines: {
          create: computed.map((l, i) => {
            const v = byId.get(l.variantId)!;
            return {
              lineNo: i + 1,
              productId: v.productId,
              variantId: v.id,
              description: [v.product.nameAr, v.color?.nameAr, v.size?.code].filter(Boolean).join(' · '),
              quantity: dec(l.quantity).toString(),
              unitPrice: dec(l.unitPrice).toString(),
              discountAmount: '0',
              taxRate: '0',
              taxAmount: '0',
              lineTotal: l.lineTotal.toString(),
            };
          }),
        },
      },
    });

    if (wantsPayment) {
      await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          number: paymentNumber!,
          invoiceId: inv.id,
          amount: payAmount.toString(),
          method: payMethod,
          paidAt: issuedAt,
          recordedById: user.id,
        },
      });
    }

    // صرف المخزون: حركة ISSUE سالبة + نقص onHand لكل صنف من المخزن المختار.
    for (const l of computed) {
      const v = byId.get(l.variantId)!;
      await tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          productId: v.productId,
          variantId: v.id,
          warehouseId,
          type: 'ISSUE',
          quantity: dec(l.quantity).negated().toString(),
          reference: number,
          reason: 'بيع كاشير',
          userId: user.id,
        },
      });
      const stock = await tx.stock.findFirst({ where: { variantId: v.id, warehouseId, locationId: null } });
      if (stock) {
        await tx.stock.update({ where: { id: stock.id }, data: { onHand: dec(stock.onHand).minus(dec(l.quantity)).toString() } });
      } else {
        await tx.stock.create({ data: { variantId: v.id, warehouseId, onHand: dec(l.quantity).negated().toString() } });
      }
    }

    return inv;
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'cashier.sale',
    entityType: 'Invoice',
    entityId: created.id,
    detail: `${created.number} · ${formatShort(total)}${wantsPayment ? ` · مدفوع ${formatShort(payAmount)}` : ''}`,
  });

  revalidatePath('/invoices');
  revalidatePath('/inventory');
  redirect(`/invoices/${created.id}`);
}

function formatShort(v: ReturnType<typeof dec>): string {
  return v.toFixed(0);
}
