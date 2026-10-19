import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { SERVICE_PRICE_NOTE } from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import { Note } from '@/components/crud/Note';
import { setShowOnSite } from '../../catalog/products/actions';
import { SiteTabs } from '../SiteTabs';

export const metadata: Metadata = { title: 'منتجات الموقع' };

/**
 * منتجات الموقع — ما يراه الزبون، بجانب ما يطلبه.
 *
 * كل منتج نشط بصورته وسعره «يبدأ من» وألوانه ومقاساته، ومفتاح إظهاره على
 * الموقع. التعديل نفسه (الصور، الأسعار، المقاسات، الألوان) في صفحة المنتج —
 * مصدر واحد، فلا يختلف ما يُباع عمّا يُعرض.
 */
export default async function SiteProductsPage() {
  const user = await requirePermission('products.read');
  const canWrite = allows(user, 'products.write');

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, isDeleted: false, status: 'ACTIVE' },
    orderBy: [{ showOnSite: 'desc' }, { sku: 'asc' }],
    take: 300,
    select: {
      id: true,
      sku: true,
      nameAr: true,
      showOnSite: true,
      sellingPrice: true,
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], select: { path: true } },
      variants: {
        where: { isDeleted: false },
        select: { color: { select: { nameAr: true, hex: true } }, size: { select: { code: true } } },
      },
      priceTiers: {
        where: { isActive: true, OR: [{ notes: null }, { notes: { not: SERVICE_PRICE_NOTE } }] },
        select: { price: true },
      },
    },
  });

  const shown = products.filter((p) => p.showOnSite).length;
  const money = new Intl.NumberFormat('en-US');

  return (
    <AppShell user={user} title="منتجات الموقع">
      <SiteTabs active="/sales/site-products" />
      <ModuleHeader
        title="منتجات الموقع"
        count={products.length}
        action={
          canWrite ? (
            <Link href="/catalog/products/new" className="erp-btn">
              منتج جديد
            </Link>
          ) : undefined
        }
      />

      <Note>
        المعروض هنا هو ما يراه الزبون على الموقع ({shown} من {products.length} معروض). «إدارة» تفتح
        صفحة المنتج: الصور، الألوان، المقاسات، وشرائح الأسعار — وأقلّ سعر فيها هو «يبدأ من» على
        الموقع. الإظهار والإخفاء فوري.
      </Note>

      <Table
        headers={['الصورة', 'المنتج', 'يبدأ من', 'الألوان', 'المقاسات', 'على الموقع', '']}
        empty={products.length === 0}
      >
        {products.map((p) => {
          const prices = [...p.priceTiers.map((t) => Number(t.price)), Number(p.sellingPrice ?? 0)].filter((n) => n > 0);
          const priceFrom = prices.length ? Math.min(...prices) : null;
          const colors = [
            ...new Map(p.variants.filter((v) => v.color).map((v) => [v.color!.nameAr, v.color!])).values(),
          ];
          const sizes = [...new Set(p.variants.map((v) => v.size?.code).filter(Boolean))] as string[];
          const image = p.images[0]?.path;

          return (
            <tr key={p.id}>
              <td className="px-4 py-3">
                <div className="relative h-14 w-12 overflow-hidden rounded-md bg-card-2">
                  {image ? (
                    <Image src={image} alt={p.nameAr} fill sizes="48px" className="object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-center text-xs text-txt-4">—</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-txt">{p.nameAr}</p>
                <p className="text-xs text-txt-4">
                  <span className="tnum" dir="ltr">{p.sku}</span> · {p.images.length} صور
                </p>
              </td>
              <td className="tnum px-4 py-3 text-txt-2">
                {priceFrom ? `${money.format(priceFrom)} د.ع` : <span className="text-warn">بلا سعر</span>}
              </td>
              <td className="px-4 py-3">
                {colors.length ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {colors.slice(0, 6).map((c) => (
                      <span
                        key={c.nameAr}
                        title={c.nameAr}
                        className="h-4 w-4 rounded-full border border-line"
                        style={{ background: c.hex ?? 'transparent' }}
                      />
                    ))}
                    {colors.length > 6 && <span className="text-xs text-txt-3">+{colors.length - 6}</span>}
                  </span>
                ) : (
                  <span className="text-xs text-txt-4">—</span>
                )}
              </td>
              <td className="tnum px-4 py-3 text-xs text-txt-2" dir="ltr">
                {sizes.length ? (sizes.length > 1 ? `${sizes[0]} – ${sizes[sizes.length - 1]}` : sizes[0]) : '—'}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  <Badge tone={p.showOnSite ? 'ok' : 'muted'}>{p.showOnSite ? 'معروض' : 'مخفي'}</Badge>
                  {canWrite && (
                    <form action={setShowOnSite.bind(null, p.id, !p.showOnSite)}>
                      <button type="submit" className="text-xs text-brand underline">
                        {p.showOnSite ? 'إخفاء' : 'إظهار'}
                      </button>
                    </form>
                  )}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link href={`/catalog/products/${p.id}`} className="text-xs font-medium text-brand underline">
                  إدارة
                </Link>
              </td>
            </tr>
          );
        })}
      </Table>
    </AppShell>
  );
}
