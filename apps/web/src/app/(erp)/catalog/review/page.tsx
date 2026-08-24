import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { can, dec, PRICE_SERVICE_AR, type PriceService } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import { setShowOnSite } from '../products/actions';

export const metadata: Metadata = { title: 'مراجعة عرض الموقع' };

/**
 * مراجعة وموافقة — مركز التحكّم فيما يظهر على الموقع العام.
 *
 * شاشة واحدة: كل منتج بصورته وألوانه وأسعاره وحالة ظهوره. المدير يوافق
 * (يُظهر) أو يُخفي بضغطة، فما يراه الزائر هو ما اعتمده هنا — بلا تعديل كود
 * ولا نشر. الموقع يعرض ACTIVE + showOnSite فقط، وهذه الصفحة تديره.
 */
export default async function ReviewPage() {
  const user = await requirePermission('products.read');
  const canWrite = can(user.role, 'products.write');

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: [{ showOnSite: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      sku: true,
      nameAr: true,
      status: true,
      showOnSite: true,
      category: { select: { nameAr: true } },
      images: { where: { isPrimary: true }, take: 1, select: { path: true } },
      variants: {
        where: { isDeleted: false },
        select: { color: { select: { nameAr: true, hex: true } }, size: { select: { code: true } } },
      },
      priceTiers: {
        where: { isActive: true },
        select: { service: true, price: true, currency: true, variantId: true },
      },
    },
  });

  const shown = products.filter((p) => p.showOnSite && p.status === 'ACTIVE').length;
  const hidden = products.length - shown;

  return (
    <AppShell user={user} title="مراجعة عرض الموقع">
      <ModuleHeader
        title="مراجعة عرض الموقع"
        action={
          <Link href="/catalog/products" className="erp-btn-ghost">
            كل المنتجات
          </Link>
        }
      />

      <p className="mb-5 max-w-[70ch] text-xs leading-[1.9] text-txt-3">
        هذه الشاشة تتحكّم فيما يظهر على الموقع العام. الزائر يرى فقط المنتجات
        <span className="font-medium text-ok"> المعروضة</span> — أظهِر أو أخفِ أيّ منتج بضغطة،
        فيتغيّر الموقع فوراً بلا نشر. المنتج الجديد يظهر تلقائياً، وتقدر تخفيه من هنا.
      </p>

      <div className="mb-6 flex flex-wrap gap-3">
        <span className="rounded-full bg-ok-soft px-3 py-1.5 text-xs text-ok">معروض على الموقع: {shown}</span>
        <span className="rounded-full bg-card-2 px-3 py-1.5 text-xs text-txt-2">مخفي: {hidden}</span>
      </div>

      <Table
        headers={['', 'المنتج', 'التصنيف', 'الألوان', 'الأسعار', 'الحالة', 'الموقع', '']}
        empty={products.length === 0}
      >
        {products.map((p) => {
          // ملخّص السعر: أقل وأعلى سعر بين الشرائح النشطة، مع تنبيه لو مافيش أسعار.
          const prices = p.priceTiers.map((t) => dec(t.price));
          const currency = p.priceTiers[0]?.currency ?? 'IQD';
          const min = prices.length ? prices.reduce((a, b) => (b.lt(a) ? b : a)) : null;
          const max = prices.length ? prices.reduce((a, b) => (b.gt(a) ? b : a)) : null;
          const perColor = p.priceTiers.some((t) => t.variantId !== null);
          const services = [...new Set(p.priceTiers.map((t) => t.service))];
          const colors = [...new Map(p.variants.filter((v) => v.color).map((v) => [v.color!.nameAr, v.color!.hex])).entries()];
          const onSite = p.showOnSite && p.status === 'ACTIVE';

          return (
            <tr key={p.id} className="hover:bg-card-2">
              <td className="py-2 ps-4">
                <div className="relative h-11 w-11 overflow-hidden rounded-md bg-card-2">
                  {p.images[0] ? (
                    <Image src={p.images[0].path} alt={p.nameAr} fill sizes="44px" className="object-cover" />
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-txt">{p.nameAr}</div>
                <div dir="ltr" className="tnum text-start text-[0.7rem] text-txt-4">{p.sku}</div>
              </td>
              <td className="px-4 py-3 text-txt-2">{p.category.nameAr}</td>
              <td className="px-4 py-3">
                {colors.length === 0 ? (
                  <span className="text-[0.7rem] text-txt-4">—</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-1">
                    {colors.slice(0, 6).map(([name, hex]) => (
                      <span
                        key={name}
                        title={name}
                        className="inline-block h-4 w-4 rounded-full border border-line-2"
                        style={{ backgroundColor: hex ?? 'transparent' }}
                      />
                    ))}
                    {colors.length > 6 && <span className="text-[0.7rem] text-txt-4">+{colors.length - 6}</span>}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                {min === null ? (
                  <span className="text-[0.7rem] text-warn">لا أسعار</span>
                ) : (
                  <div className="text-xs text-txt-2">
                    <span className="tnum font-medium text-txt">
                      {min.eq(max!) ? Number(min).toLocaleString('ar-IQ') : `${Number(min).toLocaleString('ar-IQ')} – ${Number(max).toLocaleString('ar-IQ')}`} {currency}
                    </span>
                    <div className="text-[0.7rem] text-txt-4">
                      {services.map((s) => PRICE_SERVICE_AR[s as PriceService] ?? s).join(' · ')}
                      {perColor && <span className="text-brand"> · سعر حسب اللون</span>}
                    </div>
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge tone={p.status === 'ACTIVE' ? 'ok' : p.status === 'DRAFT' ? 'muted' : 'bad'}>
                  {p.status === 'ACTIVE' ? 'نشط' : p.status === 'DRAFT' ? 'مسودة' : 'متوقف'}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {onSite ? (
                  <Badge tone="ok">معروض</Badge>
                ) : (
                  <Badge tone="muted">مخفي</Badge>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  {canWrite && p.status === 'ACTIVE' && (
                    <form action={setShowOnSite.bind(null, p.id, !p.showOnSite)}>
                      <button
                        type="submit"
                        className={
                          p.showOnSite
                            ? 'rounded-lg border border-line px-3 py-1.5 text-xs text-txt-2 hover:border-bad hover:text-bad'
                            : 'rounded-lg bg-brand px-3 py-1.5 text-xs text-white hover:opacity-90'
                        }
                      >
                        {p.showOnSite ? 'إخفاء من الموقع' : 'إظهار على الموقع'}
                      </button>
                    </form>
                  )}
                  {canWrite && p.status !== 'ACTIVE' && (
                    <span className="text-[0.7rem] text-txt-4">فعّل المنتج أولاً ليُعرض</span>
                  )}
                  <Link href={`/catalog/products/${p.id}`} className="text-xs font-medium text-brand hover:underline">
                    فتح
                  </Link>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>

      <p className="mt-4 max-w-[70ch] text-[0.7rem] leading-[1.9] text-txt-4">
        «معروض» يعني أن المنتج نشط ومسموح بظهوره على الموقع معاً. المنتج المتوقف أو
        المسودة لا يظهر مهما كان هذا المفتاح — فعّله من صفحته أولاً.
      </p>
    </AppShell>
  );
}
