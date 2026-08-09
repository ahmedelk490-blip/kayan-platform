import type { Metadata } from 'next';
import Link from 'next/link';
import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { dateInput } from '@/lib/ops';
import { PurchaseForm } from '../PurchaseForm';
import { createPurchaseOrder } from '../actions';

export const metadata: Metadata = { title: 'أمر شراء جديد' };

export default async function NewPurchaseOrderPage() {
  const user = await requirePermission('purchasing.write');

  const [suppliers, variants, supplies] = await Promise.all([
    prisma.supplier.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
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
    prisma.supply.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    }),
  ]);

  return (
    <AppShell user={user} title="أمر شراء جديد">
      <ModuleHeader
        title="أمر شراء جديد"
        action={
          <Link href="/purchasing" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card p-6">
        <PurchaseForm
          action={createPurchaseOrder}
          today={dateInput(new Date())}
          suppliers={suppliers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          variants={variants.map((v) => ({
            value: v.id,
            label: `${[v.product.nameAr, v.color?.nameAr, v.size?.code].filter(Boolean).join(' · ')} (${v.sku})`,
            price: v.cost === null ? undefined : dec(v.cost).toNumber(),
          }))}
          supplies={supplies.map((s) => ({
            value: s.id,
            label: `${s.nameAr} (${s.code})`,
            // The weighted average, not the last invoice — it is the better
            // starting guess, and still editable.
            price: dec(s.avgCost).gt(0)
              ? dec(s.avgCost).toNumber()
              : s.lastUnitCost
                ? dec(s.lastUnitCost).toNumber()
                : undefined,
          }))}
        />
      </div>
    </AppShell>
  );
}
