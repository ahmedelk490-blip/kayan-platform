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

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, isDeleted: false, status: 'ACTIVE' },
    select: {
      id: true,
      nameAr: true,
      variants: {
        where: { isDeleted: false },
        select: { color: { select: { id: true, nameAr: true } } },
      },
    },
    orderBy: { nameAr: 'asc' },
  });

  // ألوان كل منتج (بلا تكرار) — للاختيار المتسلسل في الفورم.
  const productList: DamageProduct[] = products.map((p) => {
    const seen = new Map<string, string>();
    for (const v of p.variants) if (v.color && !seen.has(v.color.id)) seen.set(v.color.id, v.color.nameAr);
    return { id: p.id, nameAr: p.nameAr, colors: [...seen].map(([value, label]) => ({ value, label })) };
  });

  const services = PRICE_SERVICES.filter((s) => s !== 'NONE').map((s) => ({ value: s, label: PRICE_SERVICE_AR[s] }));

  return (
    <AppShell user={user} title="محضر هالك جديد">
      <ModuleHeader
        title="محضر هالك جديد"
        action={<Link href="/damage" className="erp-btn-ghost">رجوع</Link>}
      />
      <div className="erp-card max-w-2xl p-6">
        <DamageForm action={createDamage} products={productList} services={services} />
      </div>
    </AppShell>
  );
}
