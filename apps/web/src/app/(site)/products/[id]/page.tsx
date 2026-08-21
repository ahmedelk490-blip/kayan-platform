import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { publicProduct, siteWhatsApp } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

/** أسماء الخدمات بالعربية لجدول الأسعار. */
const SERVICE_AR: Record<string, string> = {
  EMBROIDERY: 'تطريز',
  DTF: 'طباعة DTF',
  PRINT: 'طباعة',
  SCREEN: 'طباعة سلك',
};

/**
 * وصف يُكتب من اسم المنتج وخاماته حين لا يكون له وصف مخزَّن.
 *
 * لا نخترع ميزات: نذكر ما نعرفه فعلاً — الاسم، الخامات، الألوان، المقاسات،
 * وأن التطريز والطباعة داخل المصنع. جملة صادقة خير من فقرة منمّقة مخترعة.
 */
function composeDescription(p: {
  nameAr: string;
  materials: string[];
  colors: { nameAr: string }[];
  sizes: string[];
}): string {
  const parts: string[] = [`${p.nameAr} من إنتاج مصنع كيان.`];
  if (p.materials.length) parts.push(`مصنوع من ${p.materials.join('، ')}.`);
  if (p.colors.length) parts.push(`متوفّر بألوان: ${p.colors.map((c) => c.nameAr).join('، ')}.`);
  if (p.sizes.length) parts.push(`مقاسات: ${p.sizes.join('، ')}.`);
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
  const [product, whatsapp] = await Promise.all([publicProduct(id), siteWhatsApp()]);
  if (!product) notFound();

  const description = product.descriptionAr ?? composeDescription(product);
  const cover = product.images[0] ?? null;
  const gallery = product.images.slice(1);
  const raw = cover?.startsWith('/products/'); // صور المنتجات ثابتة ومحسّنة

  const waHref = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`مرحبا، مهتم بـ${product.nameAr}. ممكن تفاصيل وسعر؟`)}`
    : null;

  return (
    <article className="px-6 pb-24 pt-28 md:px-10 md:pt-32 lg:px-16">
      <div className="mx-auto w-full max-w-[1200px]">
        {/* مسار العودة */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-body-muted">
          <Link href="/" className="transition-colors hover:text-brand">
            الرئيسية
          </Link>
          <span aria-hidden>/</span>
          <Link href="/#products" className="transition-colors hover:text-brand">
            المنتجات
          </Link>
          <span aria-hidden>/</span>
          <span className="text-body">{product.nameAr}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* ── الصورة ── */}
          <div>
            <div className="relative aspect-[3/4] overflow-hidden rounded-3xl border border-edge-strong bg-panel">
              {cover ? (
                <Image
                  src={cover}
                  alt={product.nameAr}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain"
                  priority
                  unoptimized={!raw}
                />
              ) : (
                <div className="grid h-full place-items-center text-body-subtle">لا صورة</div>
              )}
            </div>

            {gallery.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {gallery.map((src, i) => (
                  <div
                    key={i}
                    className="relative aspect-square overflow-hidden rounded-xl border border-edge bg-panel"
                  >
                    <Image src={src} alt={`${product.nameAr} — صورة ${i + 2}`} fill sizes="120px" className="object-contain" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── التفاصيل ── */}
          <div>
            <span className="text-sm font-semibold text-brand">
              {product.materials.join(' · ') || product.sku}
            </span>
            <h1 className="mt-3 font-display text-display-3 font-semibold leading-[1.15] text-body">
              {product.nameAr}
            </h1>
            <p className="mt-5 text-lg leading-[1.95] text-body-muted">{description}</p>

            {/* الألوان */}
            {product.colors.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-body">الألوان المتوفّرة</h2>
                <ul className="flex flex-wrap gap-3">
                  {product.colors.map((c) => (
                    <li key={c.nameAr} className="flex items-center gap-2 rounded-full border border-edge-strong bg-panel/60 py-1.5 pe-4 ps-1.5">
                      <span
                        aria-hidden
                        className="h-6 w-6 rounded-full border border-black/10 shadow-inner"
                        style={{ backgroundColor: c.hex ?? 'transparent' }}
                      />
                      <span className="text-sm text-body-muted">{c.nameAr}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* المقاسات */}
            {product.sizes.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-semibold text-body">المقاسات</h2>
                <ul className="flex flex-wrap gap-2">
                  {product.sizes.map((s) => (
                    <li key={s} className="grid h-10 min-w-10 place-items-center rounded-lg border border-edge-strong bg-panel/60 px-3 text-sm text-body">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* الأسعار */}
            {product.tiers.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-body">الأسعار حسب الكمية والخدمة</h2>
                <div className="overflow-hidden rounded-xl border border-edge-strong">
                  <table className="w-full text-sm">
                    <thead className="bg-panel/70 text-body-muted">
                      <tr>
                        <th className="px-4 py-2.5 text-start font-medium">الخدمة</th>
                        <th className="px-4 py-2.5 text-start font-medium">الكمية</th>
                        <th className="px-4 py-2.5 text-start font-medium">السعر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.tiers.map((t, i) => (
                        <tr key={i} className="border-t border-edge">
                          <td className="px-4 py-2.5 text-body">{SERVICE_AR[t.service] ?? t.service}</td>
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
                <p className="mt-2 text-xs text-body-subtle">
                  الأسعار تقديرية وتتغيّر مع الكمية والتصميم — اطلب عرض سعر دقيق.
                </p>
              </div>
            )}

            {/* الأزرار */}
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/#quote"
                className="inline-flex items-center rounded-full bg-brand-fill px-8 py-4 text-sm font-medium text-on-brand transition-opacity hover:opacity-90"
              >
                اطلب عرض سعر
              </Link>
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-edge-strong px-8 py-4 text-sm font-medium text-body transition-colors hover:border-brand hover:text-brand"
                >
                  اسأل على واتساب
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
