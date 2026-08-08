import type { Metadata } from 'next';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Panel } from '@/components/Kpi';

export const metadata: Metadata = { title: 'بوابة العميل' };

export default async function CustomerPortal() {
  const user = await requirePermission('portal.view');

  const categories = await prisma.category.findMany({
    where: { tenantId: user.tenantId },
    include: { _count: { select: { products: true } } },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <AppShell user={user} title="بوابة العميل">
      <div className="space-y-6">
        <Panel title="المنتجات المتاحة">
          {categories.length === 0 ? (
            <p className="text-sm text-txt-3">لم تُضَف منتجات بعد.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <li key={category.id} className="rounded-lg border border-line p-4">
                  <p className="text-sm text-txt">{category.nameAr}</p>
                  <p className="tnum mt-1 text-xs text-txt-3">
                    {category._count.products} منتج
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="طلباتي">
          <p className="text-sm text-txt-3">
            سجل الطلبات والفواتير يظهر هنا بعد بناء وحدة المبيعات.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
