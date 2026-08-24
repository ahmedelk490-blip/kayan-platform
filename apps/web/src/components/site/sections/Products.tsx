'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { SectionHeading } from '@/components/site/SectionHeading';
import { ImageReveal } from '@/components/site/Parallax';
import type { PublicProduct } from '@/lib/catalog';

/**
 * المنتجات — معرض سينمائيّ.
 *
 * فكرة مختلفة عن ألواح الخدمات وسِجِلّ الأسباب: هنا كل منتج لوحة معرض. عند
 * المرور تكبر الصورة، ويرتفع ستارٌ نبيتيّ من الأسفل، ويُرسم إطارٌ نبيتيّ حول
 * البطاقة، وينزلق الاسم بخطّ يمتدّ تحته وزرّ سهم دائري. المصدر جدول Product
 * وحده، والرابط والصور كما هي — التغيير في الإحساس لا في البيانات.
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

        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function ProductCard({ product, index }: { product: PublicProduct; index: number }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--gy', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <motion.article
      ref={ref}
      onMouseMove={onMove}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.75, ease: EASE.outExpo, delay: (index % 4) * 0.08 }}
      whileHover={{ y: -8, transition: { type: 'spring', stiffness: 320, damping: 24 } }}
      className="group/prod relative overflow-hidden rounded-[22px] border border-white/10 bg-panel/60 shadow-[0_0_0_rgba(0,0,0,0)] transition-[box-shadow,border-color] duration-300 ease-out hover:border-[color-mix(in_srgb,var(--color-brand-fill)_50%,transparent)] hover:shadow-[0_30px_70px_-32px_rgba(92,35,52,0.75)]"
    >
      {/* البطاقة كلها رابط لصفحة المنتج. */}
      <Link href={`/products/${product.id}`} aria-label={`تفاصيل ${product.nameAr}`} className="absolute inset-0 z-20" />

      <ImageReveal delay={(index % 4) * 0.08} className="relative aspect-[4/5] overflow-hidden bg-panel-2">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.nameAr}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-[900ms] ease-out group-hover/prod:scale-[1.08]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-body-subtle">لا توجد صورة بعد</div>
        )}

        {/* بريق نبيتيّ يتبع المؤشّر فوق الصورة. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[11] opacity-0 mix-blend-screen transition-opacity duration-500 group-hover/prod:opacity-100"
          style={{
            background:
              'radial-gradient(220px 220px at var(--gx,50%) var(--gy,50%), color-mix(in srgb, var(--color-brand-fill) 45%, transparent), transparent 60%)',
          }}
        />

        {/* ستار نبيتيّ يرتفع من الأسفل عند المرور. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[12] h-2/3 translate-y-6 opacity-0 transition-all duration-500 ease-out group-hover/prod:translate-y-0 group-hover/prod:opacity-100"
          style={{
            background:
              'linear-gradient(to top, color-mix(in srgb, var(--color-primary-950) 92%, transparent), color-mix(in srgb, var(--color-primary-900) 30%, transparent) 55%, transparent)',
          }}
        />

        {/* تدرّج أساسي دائم ليبقى الاسم مقروءاً. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[13] bg-gradient-to-t from-black/75 via-black/25 to-transparent p-4 pt-14">
          <h3 className="font-display text-base font-semibold text-white md:text-lg">
            {product.nameAr}
            {/* خطّ يمتدّ تحت الاسم عند المرور. */}
            <span className="mt-1 block h-px w-0 bg-brand-fill/80 transition-all duration-500 ease-out group-hover/prod:w-10" />
          </h3>
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/85">
            شوف التفاصيل
            <span aria-hidden className="transition-transform duration-300 group-hover/prod:-translate-x-1">←</span>
          </span>
        </div>

        {/* زرّ سهم دائري يظهر أعلى البداية عند المرور. */}
        <span
          aria-hidden
          className="absolute end-3 top-3 z-[14] grid h-9 w-9 -translate-y-1 place-items-center rounded-full border border-white/25 bg-black/30 text-white opacity-0 backdrop-blur-sm transition-all duration-400 ease-out group-hover/prod:translate-y-0 group-hover/prod:opacity-100"
        >
          ←
        </span>
      </ImageReveal>

      {/* إطار نبيتيّ رفيع يُرسم داخل البطاقة عند المرور. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[6px] z-[15] rounded-[16px] border border-brand-fill/0 transition-colors duration-500 group-hover/prod:border-brand-fill/30"
      />
    </motion.article>
  );
}
