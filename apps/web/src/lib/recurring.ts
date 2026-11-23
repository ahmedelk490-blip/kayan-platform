import { prisma } from './prisma';

/** المصروفات الثابتة التي حُذفت نهائياً قبل خاصية الإيقاف — من سجل العمليات. */
export async function deletedRecurring(tenantId: string) {
  const [created, live] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId, action: 'recurring.create', entityType: 'RecurringExpense' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, entityId: true, detail: true, createdAt: true },
    }),
    prisma.recurringExpense.findMany({ where: { tenantId }, select: { nameAr: true } }),
  ]);
  // ما حُذف عمداً بزر «حذف» (بعد إضافته) لا يُعرض للاسترجاع.
  const removed = await prisma.auditLog.findMany({
    where: { tenantId, action: 'recurring.delete', entityType: 'RecurringExpense' },
    select: { entityId: true, createdAt: true },
  });
  const have = new Set(live.map((r) => r.nameAr));
  const out: { id: string; nameAr: string; amount: number; createdAt: Date }[] = [];
  for (const a of created) {
    const name = a.entityId ?? '';
    const amount = Number((a.detail ?? '').trim().split(/\s+/).pop());
    if (!name || have.has(name) || !(amount > 0)) continue;
    if (removed.some((d) => d.entityId === name && d.createdAt >= a.createdAt)) continue;
    have.add(name);
    out.push({ id: a.id, nameAr: name, amount, createdAt: a.createdAt });
  }
  return out;
}
