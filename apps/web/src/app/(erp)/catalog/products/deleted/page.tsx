import type { Metadata } from 'next';
import Link from 'next/link';
import { can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { restoreProduct } from '../actions';

export const metadata: Metadata = { title: 'المنتجات المحذوفة' };

/** المنتجات المحذوفة (حذف ناعم) — تُستعرض وتُسترجَع بضغطة. */
export default async function DeletedProductsPage() {
  const user = await requirePermission('products.write');

  const rows = await prisma.product.findMany({
    where: { tenantId: user.tenantId, isDeleted: true },
    orderBy: { deletedAt: 'desc' },
    take: 200,
    select: {
      id: true, sku: true, nameAr: true, deletedAt: true,
      category: { select: { nameAr: true } },
      _count: { select: { variants: true } },
    },
  });
  const canWrite = can(user.role, 'products.write');

  return (
    <AppShell user={user} title="المنتجات المحذوفة">
      <ModuleHeader
        title="المنتجات المحذوفة"
        count={rows.length}
        action={<Link href="/catalog/products" className="erp-btn-ghost">المنتجات</Link>}
      />

      <p className="mb-4 text-xs leading-[1.9] text-txt-4">
        الحذف ناعم — المنتج لا يُمحى فعلياً بل يُخفى من النظام والموقع. استرجاعه يعيده كما كان
        (ويظهر على الموقع إن كان نشطاً ومعروضاً).
      </p>

      <Table headers={['الكود', 'الاسم', 'التصنيف', 'المتغيّرات', 'حُذف في', '']} empty={rows.length === 0}>
        {rows.map((p) => (
          <tr key={p.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-3">{p.sku}</td>
            <td className="px-4 py-3 text-txt">{p.nameAr}</td>
            <td className="px-4 py-3 text-txt-2">{p.category.nameAr}</td>
            <td className="tnum px-4 py-3 text-txt-3">{p._count.variants}</td>
            <td className="tnum px-4 py-3 text-txt-3">{p.deletedAt ? p.deletedAt.toLocaleDateString('ar-EG') : '—'}</td>
            <td className="px-4 py-3 text-end">
              {canWrite && (
                <form action={restoreProduct.bind(null, p.id)}>
                  <button type="submit" className="text-xs font-medium text-brand hover:underline">استرجاع</button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </AppShell>
  );
}
