import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/site/PageHero';
import { publicProducts } from '@/lib/catalog';

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
        lead="كل قطعة تنخاط وتنطبع وتنطرّز بمعملنا. اختار الموديل واطلب عرض سعر بالكمية اللي تحتاجها."
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
          // نفس بطاقة الصفحة الرئيسية: حجم موحّد، صورة المصنع الحقيقية،
          // والبطاقة كلها رابط لصفحة المنتج. عمودان على الموبايل حتى أربعة
          // على الأكبر — شبكة تُقرأ كمجموعة واحدة متّسقة.
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                aria-label={`تفاصيل ${p.nameAr}`}
                className="group relative block overflow-hidden rounded-2xl border border-edge-strong bg-panel/70 transition-all duration-300 hover:border-brand/50 hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.7)]"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-panel-2">
                  {p.image ? (
                    <Image
                      src={p.image}
                      alt={p.nameAr}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-body-subtle">
                      لا توجد صورة بعد
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-4 pt-12">
                    <h2 className="text-base font-semibold text-white">{p.nameAr}</h2>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-white/85">
                      شوف التفاصيل
                      <span aria-hidden className="transition-transform duration-300 group-hover:-translate-x-1">←</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>
    </>
  );
}
