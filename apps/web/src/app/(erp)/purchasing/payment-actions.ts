'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { balance, dec, exceedsBalance, PAYMENT_METHODS } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { numeric } from '@/lib/num';
import { nextPurchaseNumber, type FormState } from './shared';

/**
 * دفعات الموردين — الطرف الغائب من الميزان.
 *
 * النظام كان يعرف ما لنا عند الزبائن بدقّةٍ تامّة: فاتورة ومدفوع ومتبقٍّ
 * وأعمار ديون وتذكير واتساب. وما علينا للموردين لم يكن يُسجَّل أصلاً —
 * أمر الشراء فيه «الإجمالي» ولا «مدفوع» له. فيُشترى بخمسة ملايين ويُدفع
 * اثنان، ولا شيء في النظام يعرف أن عليه ثلاثة.
 *
 * والبناء هنا مرآةٌ لدفعات العملاء عمداً: نفس القفل، ونفس سقف المتبقي،
 * ونفس العكس بدفعةٍ سالبة تشير إلى أصلها. من عرف تحصيل العميل عرف هذه.
 */

const Schema = z.object({
  amount: numeric(z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر.')),
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().optional(),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  notes: z.string().trim().max(400).optional().or(z.literal('')),
});

/**
 * قفل تسلسل دفعات الموردين.
 *
 * كقفل دفعات العملاء: ضغطتان متزامنتان على «سجّل دفعة» تتسلسلان، فلا يمرّ
 * دفعتان فوق المتبقي ولا يدهس أحدهما `paidAmount` الآخر ولا يتكرّر رقم.
 */
async function lockSupplierSequence(
  tx: Parameters<Parameters<typeof tenantTransaction>[0]>[0],
  tenantId: string,
): Promise<void> {
  await tx.$queryRawUnsafe('SELECT `id` FROM `Tenant` WHERE `id` = ? FOR UPDATE', tenantId);
}

export async function recordSupplierPayment(
  purchaseOrderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('purchasing.write');

  const parsed = Schema.safeParse({
    amount: String(formData.get('amount') ?? ''),
    method: String(formData.get('method') ?? ''),
    paidAt: String(formData.get('paidAt') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true, number: true, supplierId: true, status: true, total: true, paidAmount: true },
  });
  if (!order) return { error: 'أمر الشراء غير موجود.' };
  if (order.status === 'DRAFT') return { error: 'أكّد الأمر أوّلاً.' };
  if (order.status === 'CANCELLED') return { error: 'الأمر ملغى.' };

  if (exceedsBalance(parsed.data.amount, order.total, order.paidAmount)) {
    return {
      fieldErrors: {
        amount: `المبلغ يتجاوز المتبقي (${balance(order.total, order.paidAmount).toString()}).`,
      },
    };
  }

  const paidAtDate = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();

  const result = await tenantTransaction(async (tx) => {
    await lockSupplierSequence(tx, user.tenantId);

    // تُقرأ طازجةً خلف القفل: دفعةٌ وقعت بين الفحص أعلاه وهذه اللحظة تغيّر المتبقي.
    const fresh = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId: user.tenantId, isDeleted: false },
      select: { total: true, paidAmount: true },
    });
    if (!fresh) return { error: 'أمر الشراء غير موجود.' } as const;
    if (exceedsBalance(parsed.data.amount, fresh.total, fresh.paidAmount)) {
      return {
        error: `المبلغ يتجاوز المتبقي (${balance(fresh.total, fresh.paidAmount).toString()}).`,
      } as const;
    }

    const number = await nextPurchaseNumber('SPY', user.tenantId);
    await tx.supplierPayment.create({
      data: {
        tenantId: user.tenantId,
        number,
        supplierId: order.supplierId,
        purchaseOrderId: order.id,
        amount: parsed.data.amount,
        method: parsed.data.method,
        paidAt: Number.isNaN(paidAtDate.getTime()) ? new Date() : paidAtDate,
        reference: parsed.data.reference || null,
        notes: parsed.data.notes || null,
        recordedById: user.id,
      },
    });

    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      // جمعٌ في القاعدة لا قراءةً ثم كتابة — كما صار في المخزون.
      data: { paidAmount: { increment: dec(parsed.data.amount).toString() } },
    });

    return { number } as const;
  });

  if ('error' in result && result.error) return { fieldErrors: { amount: result.error } };
  if (!('number' in result)) return { error: 'تعذّر تسجيل الدفعة.' };

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supplierPayment.record',
    entityType: 'PurchaseOrder',
    entityId: purchaseOrderId,
    detail: `${result.number} — ${parsed.data.amount}`,
  });

  revalidatePath(`/purchasing/${purchaseOrderId}`);
  revalidatePath('/purchasing');
  return { ok: `سُجِّلت الدفعة ${result.number}.` };
}

/**
 * عكس دفعة — دفعةٌ سالبة تشير إلى أصلها، لا حذف.
 *
 * مالٌ خرج ثم عاد حقيقةٌ يقيّدها الدفتر ولا يمحوها، كدفعات العملاء تماماً.
 */
export async function reverseSupplierPayment(
  purchaseOrderId: string,
  paymentId: string,
): Promise<void> {
  const user = await requirePermission('purchasing.write');

  const result = await tenantTransaction(async (tx) => {
    await lockSupplierSequence(tx, user.tenantId);

    const payment = await tx.supplierPayment.findFirst({
      where: { id: paymentId, tenantId: user.tenantId, purchaseOrderId, isDeleted: false },
      include: { reversedBy: true },
    });
    // المعكوسة لا تُعكس، والعكس نفسه لا يُعكس.
    if (!payment || payment.reversedBy || payment.reversesId) return null;

    const number = await nextPurchaseNumber('SPY', user.tenantId);
    await tx.supplierPayment.create({
      data: {
        tenantId: user.tenantId,
        number,
        supplierId: payment.supplierId,
        purchaseOrderId,
        amount: dec(payment.amount).negated().toString(),
        method: payment.method,
        paidAt: new Date(),
        notes: `عكس الدفعة ${payment.number}`,
        reversesId: payment.id,
        recordedById: user.id,
      },
    });

    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { paidAmount: { increment: dec(payment.amount).negated().toString() } },
    });

    return { number, original: payment.number };
  });

  if (result) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'supplierPayment.reverse',
      entityType: 'PurchaseOrder',
      entityId: purchaseOrderId,
      detail: `${result.number} reverses ${result.original}`,
    });
  }

  revalidatePath(`/purchasing/${purchaseOrderId}`);
  revalidatePath('/purchasing');
}
