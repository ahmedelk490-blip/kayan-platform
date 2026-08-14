import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, dec, formatQty, PRICE_SERVICE_AR, coverageGaps } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import { ProductForm } from '../ProductForm';
import { updateProduct, deleteProduct, deleteVariant, addPriceTier, deletePriceTier } from '../actions';
import { loadProductOptions } from '../options';
import { VariantForm } from './VariantForm';
import { PriceTierForm } from './PriceTierForm';

export const metadata: Metadata = { title: 'بيانات المنتج' };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('products.read');
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      category: true,
      images: { orderBy: { sortOrder: 'asc' } },
      materials: true,
      priceTiers: { orderBy: [{ service: 'asc' }, { minQty: 'asc' }] },
      printingOptions: true,
      embroideryOptions: true,
      variants: {
        where: { isDeleted: false },
        orderBy: { sku: 'asc' },
        include: {
          color: true,
          size: true,
          stock: { include: { warehouse: true } },
          _count: { select: { images: true } },
        },
      },
    },
  });

  if (!product) notFound();

  const options = await loadProductOptions(user.tenantId);
  const canWrite = can(user.role, 'products.write');

  // Phase 6. Read-only here on purpose: a formula is assigned from the
  // formula's own page, where its version and lines are visible. Assigning
  // one blind from the product page invites picking the wrong recipe.
  const canSeeFormulas = can(user.role, 'formula.view');
  const formulas = canSeeFormulas
    ? await prisma.productFormula.findMany({
        where: { productId: product.id },
        include: {
          formula: { include: { currentVersion: { select: { version: true } } } },
          variant: { select: { sku: true } },
        },
        orderBy: { formula: { code: 'asc' } },
      })
    : [];
  const update = updateProduct.bind(null, product.id);
  const remove = deleteProduct.bind(null, product.id);

  return (
    <AppShell user={user} title={product.nameAr}>
      <ModuleHeader
        title={product.nameAr}
        action={
          <div className="flex gap-2">
            <Link href="/catalog/products" className="erp-btn-ghost">
              رجوع
            </Link>
            {canWrite && (
              <form action={remove}>
                <button
                  type="submit"
                  className="rounded-lg border border-bad px-4 py-2 text-xs text-bad transition-colors hover:bg-bad-soft"
                >
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      <p className="mb-5 text-xs text-txt-3">
        <span dir="ltr" className="tnum">{product.sku}</span> · {product.category.nameAr}
      </p>

      {product.images.length > 0 && (
        <ul className="mb-6 flex flex-wrap gap-3">
          {product.images.slice(0, 8).map((img) => (
            <li key={img.id} className="relative h-24 w-20 overflow-hidden rounded-md border border-line">
              <Image src={img.path} alt={product.nameAr} fill sizes="80px" className="object-cover" />
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <section className="erp-card p-6">
          <h3 className="mb-5 text-sm font-semibold text-brand">البيانات</h3>
          <ProductForm
            action={update}
            // Decimal does not cross into a client component; the form is an
            // input surface and the server recalculates on submit.
            values={{
              ...product,
              cost: product.cost === null ? null : dec(product.cost).toNumber(),
              sellingPrice:
                product.sellingPrice === null ? null : dec(product.sellingPrice).toNumber(),
            }}
            categories={options.categories}
            materials={options.materials}
            printingOptions={options.printingOptions}
            embroideryOptions={options.embroideryOptions}
            selected={{
              materials: product.materials.map((m) => m.materialId),
              printing: product.printingOptions.map((p) => p.optionId),
              embroidery: product.embroideryOptions.map((e) => e.optionId),
            }}
            submitLabel="حفظ التعديلات"
          />
        </section>

        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">
              المتغيّرات ({product.variants.length})
            </h3>
            <Table
              headers={['الكود', 'اللون', 'المقاس', 'المخزون', 'الحالة', '']}
              empty={product.variants.length === 0}
            >
              {product.variants.map((v) => {
                const onHand = v.stock.reduce((sum, s) => sum.plus(dec(s.onHand)), dec(0));
                const del = deleteVariant.bind(null, product.id, v.id);
                return (
                  <tr key={v.id} className="hover:bg-card-2">
                    <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-2">
                      {v.sku}
                    </td>
                    <td className="px-4 py-3 text-txt-2">
                      {v.color ? (
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="inline-block h-3 w-3 rounded-full border border-line-2"
                            style={{ backgroundColor: v.color.hex ?? 'transparent' }}
                          />
                          {v.color.nameAr}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-txt-2">{v.size?.code ?? '—'}</td>
                    <td className="tnum px-4 py-3 text-txt">{formatQty(onHand)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={v.isActive ? 'ok' : 'muted'}>
                        {v.isActive ? 'نشط' : 'موقوف'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end">
                      {canWrite && product.variants.length > 1 && (
                        <form action={del}>
                          <button type="submit" className="text-xs text-bad hover:underline">
                            حذف
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </section>

          {canSeeFormulas && (
            <section className="erp-card p-6">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-brand">معادلات التكلفة</h3>
                <Link href="/formulas" className="text-xs text-brand hover:underline">
                  إدارة المعادلات
                </Link>
              </div>

              {formulas.length === 0 ? (
                <p className="text-[0.7rem] text-txt-4">
                  لا توجد معادلة مرتبطة — حساب تكلفة هذا المنتج سينتج صفراً. اربط معادلة
                  من صفحة المعادلة نفسها.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {formulas.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3">
                      <Link
                        href={`/formulas/${f.formula.id}`}
                        className="text-txt-2 hover:text-brand"
                      >
                        {f.formula.nameAr}
                        <span className="ms-2 text-[0.7rem] text-txt-4">
                          {f.variant ? f.variant.sku : 'كل المتغيّرات'}
                        </span>
                      </Link>
                      {f.formula.currentVersion ? (
                        <Badge tone="ok">إصدار {f.formula.currentVersion.version}</Badge>
                      ) : (
                        <Badge tone="muted">غير منشورة</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {canWrite && (
            <section className="erp-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">إضافة متغيّر</h3>
              <VariantForm productId={product.id} colors={options.colors} sizes={options.sizes} />
            </section>
          )}

          {/* ── أسعار البيع حسب الخدمة والكمية ──────────────── */}
          <section className="erp-card p-6">
            <h3 className="mb-1 text-sm font-semibold text-brand">أسعار البيع</h3>
            <p className="mb-4 text-[0.7rem] leading-[1.9] text-txt-4">
              سعر لكل خدمة ونطاق كمية. تظهر على الموقع العام فور الحفظ، بلا نشر.
            </p>

            <Table
              headers={['الخدمة', 'الكمية', 'السعر', 'المتغيّر', '']}
              empty={product.priceTiers.length === 0}
            >
              {product.priceTiers.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 text-txt">
                    {(PRICE_SERVICE_AR as Record<string, string>)[t.service] ?? t.service}
                  </td>
                  <td className="tnum px-4 py-2.5 text-txt-3">
                    {t.maxQty === null ? `${t.minQty} فأكثر` : `${t.minQty} – ${t.maxQty}`}
                  </td>
                  <td className="tnum px-4 py-2.5 font-medium text-txt">
                    {Number(t.price).toLocaleString('ar-IQ')} {t.currency}
                  </td>
                  <td className="px-4 py-2.5 text-[0.7rem] text-txt-4">
                    {t.variantId
                      ? (product.variants.find((v) => v.id === t.variantId)?.sku ?? '—')
                      : 'كل المتغيّرات'}
                  </td>
                  <td className="px-4 py-2.5 text-end">
                    {canWrite && (
                      <form action={deletePriceTier.bind(null, product.id, t.id)}>
                        <button type="submit" className="text-[0.7rem] text-bad hover:underline">
                          حذف
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>

            {/* فجوات التغطية تُعلَن هنا لا تُكتشف عند أول عرض سعر بلا سعر. */}
            {(['EMBROIDERY', 'DTF'] as const).map((service) => {
              const gaps = coverageGaps(
                product.priceTiers.map((t) => ({ ...t, price: t.price.toString() })),
                service,
              );
              if (product.priceTiers.every((t) => t.service !== service)) return null;
              if (gaps.length === 0) return null;
              return (
                <p
                  key={service}
                  className="mt-3 rounded-lg border border-warn bg-warn-soft px-4 py-2.5 text-[0.7rem] text-warn"
                >
                  {PRICE_SERVICE_AR[service]}: لا سعر للكميات {gaps.join(' · ')} — أي طلب بهذه
                  الكمية لن يجد سعراً.
                </p>
              );
            })}

            {canWrite && (
              <div className="mt-6 border-t border-line pt-5">
                <PriceTierForm
                  action={addPriceTier.bind(null, product.id)}
                  currency={product.priceTiers[0]?.currency ?? 'IQD'}
                  variants={product.variants.map((v) => ({ value: v.id, label: v.sku }))}
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
