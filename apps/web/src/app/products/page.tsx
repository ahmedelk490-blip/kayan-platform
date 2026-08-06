import type { Metadata } from 'next';
import Image from 'next/image';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Kpi, Panel } from '@/components/Kpi';

export const metadata: Metadata = { title: 'المنتجات' };

/**
 * إدارة المنتجات.
 *
 * Every product and image here came from the client's Google Drive via
 * scripts/import-drive.mjs — nothing is placeholder. Images are WebP,
 * capped at 1400px, and served from the app's own public directory rather
 * than hot-linked from Drive.
 */
export default async function ProductsPage() {
  const user = await requirePermission('products.read');

  const categories = await prisma.category.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { sortOrder: 'asc' },
    include: {
      products: {
        orderBy: { sku: 'asc' },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });

  const products = categories.flatMap((c) => c.products);
  const images = products.flatMap((p) => p.images);
  const totalBytes = images.reduce((sum, i) => sum + i.bytes, 0);

  return (
    <AppShell user={user} title="المنتجات">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="المنتجات" value={String(products.length)} unit="منتج" />
          <Kpi label="التصنيفات" value={String(categories.length)} unit="تصنيف" />
          <Kpi label="الصور" value={String(images.length)} unit="صورة" />
          <Kpi
            label="حجم الصور"
            value={(totalBytes / 1024 / 1024).toFixed(1)}
            unit="ميجابايت"
            hint="بصيغة WebP"
          />
        </div>

        {categories.map((category) => (
          <Panel
            key={category.id}
            title={`${category.nameAr} — ${category.products.length} منتج`}
          >
            {category.products.length === 0 ? (
              <p className="text-sm text-neutral-500">لا توجد منتجات في هذا التصنيف.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {category.products.map((product) => {
                  const cover = product.images.find((i) => i.isPrimary) ?? product.images[0];
                  return (
                    <li
                      key={product.id}
                      className="overflow-hidden rounded-lg border border-ink-800 bg-ink-950"
                    >
                      <div className="relative aspect-[3/4] bg-ink-900">
                        {cover ? (
                          <Image
                            src={cover.path}
                            alt={product.nameAr}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-neutral-600">
                            لا توجد صورة
                          </div>
                        )}
                      </div>

                      <div className="p-4">
                        <p className="truncate text-sm text-neutral-100">{product.nameAr}</p>
                        <p dir="ltr" className="tnum mt-1 text-start text-[0.7rem] text-neutral-500">
                          {product.sku}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-[0.7rem]">
                          <span className="text-neutral-500">{product.images.length} صورة</span>
                          <span
                            className={
                              product.isActive
                                ? 'rounded-full bg-success-600/15 px-2 py-0.5 text-success-500'
                                : 'rounded-full bg-danger-600/15 px-2 py-0.5 text-danger-500'
                            }
                          >
                            {product.isActive ? 'نشط' : 'موقوف'}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        ))}
      </div>
    </AppShell>
  );
}
