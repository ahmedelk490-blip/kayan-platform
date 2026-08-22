import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager, Badge } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { loadProductOptions } from './options';
import { NewProductModal, EditProductModal } from './ProductModal';

export const metadata: Metadata = { title: 'المنتجات' };

const SORTS = [
  { value: 'createdAt', label: 'الأحدث' },
  { value: 'nameAr', label: 'الاسم' },
  { value: 'sku', label: 'الكود' },
];

const STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'muted' }> = {
  ACTIVE: { label: 'نشط', tone: 'ok' },
  DRAFT: { label: 'مسودة', tone: 'muted' },
  DISCONTINUED: { label: 'متوقف', tone: 'bad' },
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('products.read');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'createdAt',
    allowedSorts: SORTS.map((s) => s.value),
  });

  const categoryFilter = Array.isArray(params.category) ? params.category[0] : params.category;

  const where: Prisma.ProductWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(categoryFilter ? { categoryId: categoryFilter } : {}),
    ...(query.q
      ? {
          OR: [
            { nameAr: { contains: query.q } },
            { nameEn: { contains: query.q } },
            { sku: { contains: query.q } },
            { barcode: { contains: query.q } },
          ],
        }
      : {}),
  };

  const [rows, count, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        category: { select: { nameAr: true } },
        images: { where: { isPrimary: true }, take: 1 },
        materials: { select: { materialId: true } },
        printingOptions: { select: { optionId: true } },
        embroideryOptions: { select: { optionId: true } },
        _count: { select: { variants: true, images: true } },
      },
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const canWrite = can(user.role, 'products.write');
  // The modal form needs the same option lists the full-page route builds.
  // Loaded only when the user can actually open it.
  const formOptions = canWrite
    ? await loadProductOptions(user.tenantId)
    : { categories: [], materials: [], printingOptions: [], embroideryOptions: [], colors: [], sizes: [] };

  return (
    <AppShell user={user} title="المنتجات">
      <ModuleHeader
        title="المنتجات"
        count={count}
        action={canWrite ? <NewProductModal options={formOptions} /> : null}
      />

      <Toolbar placeholder="ابحث بالاسم أو الكود أو الباركود…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/catalog/products"
          className={
            categoryFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/products?category=${c.id}`}
            className={
              categoryFilter === c.id
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {c.nameAr}
          </Link>
        ))}
      </div>

      <Table
        headers={['', 'الاسم', 'الكود', 'التصنيف', 'المتغيّرات', 'الصور', 'الحالة', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => {
          const status = STATUS[row.status] ?? STATUS.ACTIVE;
          return (
            <tr key={row.id} className="hover:bg-card-2">
              <td className="py-2 ps-4">
                <div className="relative h-11 w-11 overflow-hidden rounded-md bg-card-2">
                  {row.images[0] ? (
                    <Image
                      src={row.images[0].path}
                      alt={row.nameAr}
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3 font-medium text-txt">{row.nameAr}</td>
              <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-3">
                {row.sku}
              </td>
              <td className="px-4 py-3 text-txt-2">{row.category.nameAr}</td>
              <td className="tnum px-4 py-3 text-txt-2">{row._count.variants}</td>
              <td className="tnum px-4 py-3 text-txt-3">{row._count.images}</td>
              <td className="px-4 py-3">
                <Badge tone={status.tone}>{status.label}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  {canWrite && (
                    <EditProductModal
                      id={row.id}
                      sku={row.sku}
                      options={formOptions}
                      values={{
                        nameAr: row.nameAr,
                        nameEn: row.nameEn,
                        sku: row.sku,
                        barcode: row.barcode,
                        categoryId: row.categoryId,
                        descriptionAr: row.descriptionAr,
                        // Decimal is not serialisable across the boundary, so
                        // the form receives plain numbers. The server
                        // recalculates in Decimal on submit.
                        cost: row.cost === null ? null : Number(row.cost.toString()),
                        sellingPrice:
                          row.sellingPrice === null ? null : Number(row.sellingPrice.toString()),
                        status: row.status,
                      }}
                      selected={{
                        materials: row.materials.map((m) => m.materialId),
                        printing: row.printingOptions.map((p) => p.optionId),
                        embroidery: row.embroideryOptions.map((e) => e.optionId),
                      }}
                    />
                  )}
                  <Link href={`/catalog/products/${row.id}`} className="text-xs text-brand hover:underline">
                    عرض
                  </Link>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>

      <Pager basePath="/catalog/products" query={query} count={count} />
    </AppShell>
  );
}
