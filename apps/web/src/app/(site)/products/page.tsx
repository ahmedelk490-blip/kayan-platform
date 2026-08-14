import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/site/PageHero';
import { publicProducts } from '@/lib/catalog';
import { PRICE_SERVICE_AR } from '@erp/domain';

/** أسماء الخدمات بالعربية — من الحزمة لا مكرّرة هنا. */
const SERVICE_AR: Record<string, string> = PRICE_SERVICE_AR;

export const metadata: Metadata = {
  title: 'منتجاتنا',
  description:
    'يلكات وتيشيرتات ومرايل وشماغ وزي المطاعم والشركات — تصنيع كيان مع طباعة وتطريز داخل المصنع.',
  alternates: { canonical: '/products' },
};

/**
 * صفحة المنتجات العامة.
 *
 * تقرأ من جدول Product نفسه الذي يحرّره المدير من النظام. لا نسخة، ولا
 * قائمة مكتوبة في الكود: ما يظهر هنا هو ما في قاعدة البيانات لحظة الطلب.
 *
 * `dynamic = 'force-dynamic'` مقصود. الصفحة الثابتة تُبنى مرة وتبقى، فتعديل
 * المدير لسعر أو إيقافه لمنتج لن يظهر حتى النشر التالي — وهذا بالضبط
 * التكرار الذي أُزيل. الطلب يقرأ الجدول في كل مرة.
 */
export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const products = await publicProducts();

  return (
    <>
      <PageHero
        eyebrow="منتجاتنا"
        title="زي موحّد يتحمّل الشغل."
        lead="كل قطعة تُخاط وتُطبع وتُطرّز داخل المصنع. اختر الموديل واطلب عرض سعر بالكمية التي تحتاجها."
      />

      <SectionShell size="tall">
        {products.length === 0 ? (
          // لا منتج معروض. الصمت هنا أصدق من بطاقات وهمية — والرسالة تقول
          // السبب بدل أن تبدو الصفحة معطّلة.
          <p className="mx-auto max-w-[640px] rounded-2xl border border-edge-strong bg-panel/70 px-6 py-8 text-center text-sm leading-[1.9] text-body-muted">
            لا توجد منتجات معروضة حالياً. تواصل معنا مباشرةً وسنرسل لك الكتالوج
            وعرض السعر حسب طلبك.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <article
                key={p.id}
                className="group overflow-hidden rounded-2xl border border-edge-strong bg-panel/70 transition-shadow duration-300 hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.55)]"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-panel-2">
                  {p.image ? (
                    <Image
                      src={p.image}
                      alt={p.nameAr}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                    />
                  ) : (
                    // لا صورة على القرص. لا تُستعار صورة منتج آخر.
                    <div className="flex h-full items-center justify-center text-xs text-body-subtle">
                      لا توجد صورة بعد
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <h2 className="text-base font-medium text-body">{p.nameAr}</h2>
                  {p.nameEn && (
                    <p dir="ltr" className="mt-0.5 text-start text-[0.7rem] text-body-subtle">
                      {p.nameEn}
                    </p>
                  )}

                  {p.descriptionAr && (
                    <p className="mt-3 text-sm leading-[1.9] text-body-muted">{p.descriptionAr}</p>
                  )}

                  <dl className="mt-4 space-y-1.5 text-[0.75rem] text-body-muted">
                    {p.colors.length > 0 && (
                      <div className="flex gap-2">
                        <dt className="text-body-subtle">الألوان</dt>
                        <dd>{p.colors.join(' · ')}</dd>
                      </div>
                    )}
                    {p.sizes.length > 0 && (
                      <div className="flex gap-2">
                        <dt className="text-body-subtle">المقاسات</dt>
                        <dd dir="ltr" className="text-start">{p.sizes.join(' · ')}</dd>
                      </div>
                    )}
                    {p.materials.length > 0 && (
                      <div className="flex gap-2">
                        <dt className="text-body-subtle">الخامة</dt>
                        <dd>{p.materials.join(' · ')}</dd>
                      </div>
                    )}
                  </dl>

                  {/* شرائح السعر من قاعدة البيانات. لا سعر مخترع: ما لم
                      تُدخله الإدارة لا يُعرض له رقم. */}
                  {p.tiers.length > 0 && (
                    <ul className="mt-4 space-y-1.5 border-t border-edge pt-4">
                      {p.tiers.map((t) => (
                        <li
                          key={`${t.service}-${t.minQty}`}
                          className="flex items-baseline justify-between gap-3 text-[0.75rem]"
                        >
                          <span className="text-body-muted">
                            {SERVICE_AR[t.service] ?? t.service}
                            <span className="ms-1.5 text-body-subtle">
                              {t.maxQty === null
                                ? `${t.minQty} قطعة فأكثر`
                                : `${t.minQty}–${t.maxQty} قطعة`}
                            </span>
                          </span>
                          <span className="tnum shrink-0 font-medium text-brand">
                            {Number(t.price).toLocaleString('ar-IQ')} {t.currency === 'IQD' ? 'د.ع' : t.currency}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-edge pt-4">
                    {p.tiers.length === 0 && (
                      <span className="text-xs text-body-subtle">السعر حسب الكمية</span>
                    )}
                    <Link href="/contact" className="ms-auto text-xs text-brand hover:underline">
                      اطلب عرض سعر
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionShell>
    </>
  );
}
