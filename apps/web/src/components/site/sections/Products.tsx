'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { SectionHeading } from '@/components/site/SectionHeading';
import { ImageReveal } from '@/components/site/Parallax';
import { PRODUCTS_WITHOUT_PHOTOS } from '@/site';
import type { PublicProduct } from '@/lib/catalog';

/**
 * المنتجات.
 *
 * كل بطاقة تعرض صورة حقيقية من إنتاج المصنع. المنتجات التي لا نملك صورها
 * تُذكر نصاً تحت الشبكة بدل أن تُعطى صورة مستعارة — العميل يشتري ما يرى.
 */
/**
 * بطاقات المنتجات على الصفحة الرئيسية.
 *
 * المنتجات تصل كخاصيّة من الخادم بعد قراءتها من جدول Product — لا تُقرأ
 * من site.ts بعد اليوم. التصميم كما اعتُمد؛ المتغيّر هو المصدر وحده.
 */
export function Products({ products }: { products: PublicProduct[] }) {
  return (
    <SectionShell size="tall">
      <div id="products" className="mx-auto w-full max-w-[1400px]">
        <SectionHeading
          eyebrow="منتجاتنا"
          title="شغل تشوفه قبل لا تطلبه."
          lead="اضغط على أي منتج تشوف تفاصيله وألوانه وخاماته كاملة."
        />

        {/* عمودان على الموبايل، ثلاثة ثم أربعة على الأكبر — بطاقات بحجم
            واحد متّسق في كل المقاسات، لا بطاقة عملاقة على الهاتف. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product, index) => (
            <motion.article
              key={product.id}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.75, ease: EASE.outExpo, delay: (index % 3) * 0.08 }}
              // Lift and a slight scale, both transforms. The shadow rides on
              // a CSS transition rather than a motion value: box-shadow is the
              // one property here that cannot be composited, and paying for it
              // on a single hovered card is fine where paying for it on twelve
              // entering cards would not be.
              // Spring rather than a tween on hover: a card that settles reads
              // as a physical object, where a linear ease reads as a slide.
              // The spring lives INSIDE whileHover so it applies to the hover
              // only — the entrance keeps its own eased timing above.
              whileHover={{
                y: -8,
                scale: 1.015,
                transition: { type: 'spring', stiffness: 320, damping: 24 },
              }}
              className="group relative overflow-hidden rounded-2xl border border-edge-strong bg-panel/70 shadow-[0_0_0_rgba(0,0,0,0)] transition-shadow duration-300 ease-out hover:border-brand/50 hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.85)]"
            >
              {/* البطاقة كلها رابط لصفحة المنتج. طبقة تغطّي البطاقة بدل لفّ
                  المحتوى، فلا تتغيّر حركة الدخول والمرور. */}
              <Link
                href={`/products/${product.id}`}
                aria-label={`تفاصيل ${product.nameAr}`}
                className="absolute inset-0 z-10"
              />
              {/* نسبة واحدة لكل البطاقات (4:5) و object-cover: كل الصور
                  بنفس الإطار والزاوية، فالشبكة تُقرأ كمجموعة واحدة متّسقة —
                  على الموبايل والكمبيوتر سواء. الصورة صورة المصنع الحقيقية. */}
              <ImageReveal delay={(index % 3) * 0.08} className="relative aspect-[4/5] overflow-hidden bg-panel-2">
                <Image
                  src={product.image ?? ''}
                  alt={product.nameAr}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                />
                {/* اسم المنتج على تدرّج خفيف أسفل الصورة — بطاقة نظيفة بلا
                    كتلة تفاصيل جانبية. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-4 pt-12">
                  <h3 className="text-base font-semibold text-white">{product.nameAr}</h3>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-white/85">
                    شوف التفاصيل
                    <span aria-hidden className="transition-transform duration-300 group-hover:-translate-x-1">←</span>
                  </span>
                </div>
              </ImageReveal>
            </motion.article>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: EASE.outExpo }}
          className="mt-10 text-sm leading-[1.9] text-body-muted"
        >
          ونصنع كذلك{' '}
          <span className="text-body">{PRODUCTS_WITHOUT_PHOTOS.join(' · ')}</span> — ما
          نزّلنا صورها بعد، واللي يبي يشوف عيّنة منها نجهّزها له.
        </motion.p>
      </div>
    </SectionShell>
  );
}
