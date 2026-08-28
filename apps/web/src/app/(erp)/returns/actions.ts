'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import type { FormState } from '@/lib/ops';

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
  const user = await requirePermission('invoices.write');

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
    include: {
      lines: true,
      customer: { select: { companyName: true, contactName: true } },
    },
  });
  if (!invoice) return { error: 'الفاتورة غير موجودة أو غير صالحة للإرجاع.' };

  const retLines: { line: (typeof invoice.lines)[number]; qty: number }[] = [];
  for (const l of invoice.lines) {
    const q = Math.max(0, Number(formData.get(`qty_${l.id}`) ?? 0) || 0);
    if (q <= 0) continue;
    if (dec(q).gt(dec(l.quantity))) {
      return { error: `الكمية المرتجعة لصنف «${l.description}» تتجاوز المباع (${dec(l.quantity).toString()}).` };
    }
    retLines.push({ line: l, qty: q });
  }
  if (retLines.length === 0) return { error: 'أدخل كمية مرتجعة لصنف واحد على الأقل.' };

  const total = retLines.reduce((s, r) => s.plus(dec(r.line.unitPrice).times(dec(r.qty))), dec(0));
  const number = await nextReturnNumber(user.tenantId);
  const warehouseId = await defaultWarehouseId(user.tenantId);
  const reason = String(formData.get('reason') ?? '').trim() || null;

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
            productId: r.line.productId,
            variantId: r.line.variantId,
            description: r.line.description,
            quantity: dec(r.qty).toString(),
            unitPrice: dec(r.line.unitPrice).toString(),
            lineTotal: dec(r.line.unitPrice).times(dec(r.qty)).toString(),
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
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'return.create',
    entityType: 'SalesReturn',
    entityId: invoice.id,
    detail: `${number} — ${invoice.number ?? ''} · ${total.toString()}`,
  });

  revalidatePath('/returns');
  revalidatePath('/inventory');
  redirect('/returns');
}

/** حذف مرتجع (ناعم) — لا يعكس المخزون تلقائياً؛ صُحّح بحركة يدوية إن لزم. */
export async function deleteReturn(id: string): Promise<void> {
  const user = await requirePermission('invoices.write');
  const ret = await prisma.salesReturn.findFirst({ where: { id, tenantId: user.tenantId, isDeleted: false }, select: { id: true, number: true } });
  if (!ret) redirect('/returns');
  await prisma.salesReturn.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'return.delete', entityType: 'SalesReturn', entityId: id, detail: ret.number });
  revalidatePath('/returns');
  redirect('/returns');
}
