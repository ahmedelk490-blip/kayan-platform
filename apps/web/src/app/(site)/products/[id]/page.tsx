import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { publicProduct, publicColors, siteWhatsApp } from '@/lib/catalog';
import { ProductBuy } from './ProductBuy';

export const dynamic = 'force-dynamic';

const SERVICE_AR: Record<string, string> = {
  EMBROIDERY: 'تطريز',
  DTF: 'طباعة DTF',
  PRINT: 'طباعة',
  SCREEN: 'طباعة سلك',
};

/**
 * وصف يُكتب من اسم المنتج وخاماته حين لا يكون له وصف مخزَّن. لا نخترع
 * ميزات: نذكر ما نعرفه فعلاً.
 */
function composeDescription(p: {
  nameAr: string;
  materials: string[];
}): string {
  const parts = [`${p.nameAr} من إنتاج مصنع كيان.`];
  if (p.materials.length) parts.push(`مصنوع من ${p.materials.join('، ')}.`);
  parts.push('التطريز والطباعة داخل المصنع، فالموعد الذي نعطيك إياه موعد نلتزم به.');
  return parts.join(' ');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await publicProduct(id);
  if (!product) return { title: 'منتج غير موجود' };
  const desc = product.descriptionAr ?? composeDescription(product);
  return {
    title: product.nameAr,
    description: desc.slice(0, 160),
    alternates: { canonical: `/products/${id}` },
    openGraph: { title: `${product.nameAr} — كيان`, images: product.images.slice(0, 1) },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, palette, whatsapp] = await Promise.all([
    publicProduct(id),
    publicColors(),
    siteWhatsApp(),
  ]);
  if (!product) notFound();

  const description = product.descriptionAr ?? composeDescription(product);
  const cover = product.images[0] ?? null;
  const gallery = product.images.slice(1, 5);

  // ألوان المنتج إن وُجدت، وإلا باقة المصنع القياسية — فالعميل يرى المتاح
  // دائماً، ويتحكّم المدير بالباقة من شاشة الألوان.
  const colors = product.colors.length > 0 ? product.colors : palette;
  const colorsAreGeneral = product.colors.length === 0;

  const waHref = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`مرحبا، مهتم بـ${product.nameAr}. ممكن تفاصيل وسعر؟`)}`
    : null;

  return (
    <article className="relative overflow-hidden pb-24 pt-28 md:pt-32">
      {/* توهّج خلفي خفيف بلون العلامة — عمق بلا صورة ثقيلة */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(92,35,52,0.16),transparent)]"
      />

      <div className="mx-auto w-full max-w-[1200px] px-6 md:px-10 lg:px-16">
        {/* مسار العودة */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-body-muted">
          <Link href="/" className="transition-colors hover:text-brand">الرئيسية</Link>
          <span aria-hidden>/</span>
          <Link href="/#products" className="transition-colors hover:text-brand">المنتجات</Link>
          <span aria-hidden>/</span>
          <span className="text-body">{product.nameAr}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          {/* ── الصورة الكبيرة ── */}
          <div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-panel-2 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.6)]">
              {cover ? (
                <Image
                  src={cover}
                  alt={product.nameAr}
                  fill
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="grid h-full place-items-center text-body-subtle">لا صورة</div>
              )}
            </div>

            {gallery.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {gallery.map((src, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-2xl border border-edge bg-panel-2">
                    <Image src={src} alt={`${product.nameAr} — ${i + 2}`} fill sizes="140px" className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── العرض ── */}
          <div className="lg:pt-4">
            <span className="inline-flex items-center gap-2.5 rounded-full bg-brand-fill/10 px-4 py-1.5 text-sm font-semibold text-brand">
              <span className="h-2 w-2 rounded-full bg-brand-fill" />
              منتجات كيان
            </span>

            <h1 className="mt-5 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.12] text-body">
              {product.nameAr}
            </h1>

            {product.materials.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {product.materials.map((m) => (
                  <span key={m} className="rounded-full border border-edge-strong px-3.5 py-1.5 text-xs text-body-muted">
                    {m}
                  </span>
                ))}
              </div>
            )}

            <p className="mt-6 text-lg leading-[2] text-body-muted">{description}</p>

            {/* اختيار اللون والمقاس والكمية + السعر + الإضافة للسلّة. */}
            <ProductBuy
              productId={product.id}
              productName={product.nameAr}
              image={cover}
              colors={colors}
              sizes={product.sizes}
              tiers={product.tiers.map((t) => ({
                service: t.service,
                minQty: t.minQty,
                maxQty: t.maxQty,
                price: Number(t.price),
                currency: t.currency,
                color: t.color,
              }))}
            />
            {colorsAreGeneral && (
              <p className="mt-3 text-xs text-body-subtle">الألوان المعروضة هي ألوان المصنع القياسية، وأي لون آخر حسب الطلب.</p>
            )}

            {/* تواصل مباشر بديل — لمن يفضّل الواتساب. */}
            {waHref && (
              <div className="mt-6">
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-edge-strong px-7 py-3 text-sm font-medium text-body transition-colors hover:border-brand hover:text-brand"
                >
                  أو اسأل على واتساب
                </a>
              </div>
            )}

            {/* الأسعار — أسفل, للمهتمّ. عمود «اللون» يظهر فقط حين يختلف السعر
                حسب اللون، فلا نُثقل الجدول بعمود «كل الألوان» بلا داعٍ. */}
            {product.tiers.length > 0 && (() => {
              const hasColorPricing = product.tiers.some((t) => t.color !== null);
              return (
              <div className="mt-10 rounded-2xl border border-edge bg-panel/50 p-6">
                <h2 className="mb-4 text-base font-semibold text-body">أسعار تقريبية حسب الكمية</h2>
                <div className="overflow-hidden rounded-xl border border-edge">
                  <table className="w-full text-sm">
                    <thead className="bg-panel/70 text-body-muted">
                      <tr>
                        <th className="px-4 py-2.5 text-start font-medium">الخدمة</th>
                        {hasColorPricing && <th className="px-4 py-2.5 text-start font-medium">اللون</th>}
                        <th className="px-4 py-2.5 text-start font-medium">الكمية</th>
                        <th className="px-4 py-2.5 text-start font-medium">السعر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.tiers.map((t, i) => (
                        <tr key={i} className="border-t border-edge">
                          <td className="px-4 py-2.5 text-body">{SERVICE_AR[t.service] ?? t.service}</td>
                          {hasColorPricing && (
                            <td className="px-4 py-2.5 text-body-muted">{t.color ?? 'كل الألوان'}</td>
                          )}
                          <td className="px-4 py-2.5 text-body-muted">
                            {t.maxQty ? `${t.minQty}–${t.maxQty}` : `${t.minQty}+`} قطعة
                          </td>
                          <td className="px-4 py-2.5 font-medium text-body">
                            {Number(t.price).toLocaleString('en-US')} {t.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-body-subtle">الأسعار تتغيّر مع الكمية والتصميم — اطلب عرضاً دقيقاً.</p>
              </div>
              );
            })()}
          </div>
        </div>
      </div>
    </article>
  );
}
