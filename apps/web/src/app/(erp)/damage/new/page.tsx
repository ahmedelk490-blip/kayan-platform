import type { Metadata } from 'next';
import Link from 'next/link';
import { PRICE_SERVICES, PRICE_SERVICE_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DamageForm, type DamageProduct } from '../DamageForm';
import { createDamage } from '../actions';

export const metadata: Metadata = { title: 'محضر هالك جديد' };

export default async function NewDamagePage() {
  const user = await requirePermission('damage.write');

  const [products, colorRows, employeeRows] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'ACTIVE' },
      select: { id: true, nameAr: true, cost: true },
      orderBy: { nameAr: 'asc' },
    }),
    // كل ألوان المستأجر — متاحة دائماً في الفورم، لا تعتمد على متغيّرات المنتج.
    prisma.color.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      select: { id: true, nameAr: true },
      orderBy: { sortOrder: 'asc' },
    }),
    // الموظفون — للموظف المتسبب الذي يُخصم الهالك من راتبه عند الاعتماد.
    prisma.user.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, name: true, nameAr: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const productList: DamageProduct[] = products.map((p) => ({
    id: p.id,
    nameAr: p.nameAr,
    cost: p.cost === null ? null : Number(p.cost.toString()),
    colors: [],
  }));
  const colors = colorRows.map((c) => ({ value: c.id, label: c.nameAr }));
  const services = PRICE_SERVICES.filter((s) => s !== 'NONE').map((s) => ({ value: s, label: PRICE_SERVICE_AR[s] }));

  return (
    <AppShell user={user} title="محضر هالك جديد">
      <ModuleHeader
        title="محضر هالك جديد"
        action={<Link href="/damage" className="erp-btn-ghost">رجوع</Link>}
      />
      <div className="erp-card max-w-2xl p-6">
        <DamageForm
          action={createDamage}
          products={productList}
          colors={colors}
          services={services}
          employees={employeeRows.map((e) => ({ value: e.id, label: e.nameAr ?? e.name }))}
        />
      </div>
    </AppShell>
  );
}
