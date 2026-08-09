import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { dateInput } from '@/lib/ops';
import { DamageForm } from '../DamageForm';
import { createDamage } from '../actions';

export const metadata: Metadata = { title: 'محضر هالك جديد' };

export default async function NewDamagePage() {
  const user = await requirePermission('damage.write');

  const [employees, variants, orders] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, name: true, nameAr: true },
      orderBy: { name: 'asc' },
    }),
    prisma.productVariant.findMany({
      where: { isDeleted: false, product: { tenantId: user.tenantId, isDeleted: false } },
      include: {
        product: { select: { nameAr: true } },
        color: { select: { nameAr: true } },
        size: { select: { code: true } },
      },
      orderBy: { sku: 'asc' },
    }),
    prisma.productionOrder.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['CANCELLED'] } },
      select: { id: true, number: true },
      orderBy: { number: 'desc' },
      take: 100,
    }),
  ]);

  return (
    <AppShell user={user} title="محضر هالك جديد">
      <ModuleHeader
        title="محضر هالك جديد"
        action={
          <Link href="/damage" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card p-6">
        <DamageForm
          action={createDamage}
          today={dateInput(new Date())}
          employees={employees.map((e) => ({ value: e.id, label: e.nameAr ?? e.name }))}
          variants={variants.map((v) => ({
            value: v.id,
            label: `${[v.product.nameAr, v.color?.nameAr, v.size?.code].filter(Boolean).join(' · ')} (${v.sku})`,
          }))}
          productionOrders={orders.map((o) => ({ value: o.id, label: o.number }))}
        />
      </div>
    </AppShell>
  );
}
