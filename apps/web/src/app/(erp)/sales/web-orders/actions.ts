'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

/** رفض طلب موقع — لا يُحذف، يبقى سجلّاً بحالة REJECTED. */
export async function rejectWebOrder(id: string): Promise<void> {
  const user = await requirePermission('invoices.write');
  const order = await prisma.webOrder.findFirst({
    where: { id, tenantId: user.tenantId, status: 'PENDING' },
    select: { id: true, number: true },
  });
  if (!order) return;
  await prisma.webOrder.update({ where: { id: order.id }, data: { status: 'REJECTED' } });
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'weborder.reject',
    entityType: 'WebOrder',
    entityId: order.id,
    detail: order.number,
  });
  revalidatePath('/sales/web-orders');
}
