'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { PRODUCTS, PRODUCTS_WITHOUT_PHOTOS } from '@/site';

/**
 * المنتجات.
 *
 * كل بطاقة تعرض صورة حقيقية من إنتاج المصنع. المنتجات التي لا نملك صورها
 * تُذكر نصاً تحت الشبكة بدل أن تُعطى صورة مستعارة — العميل يشتري ما يرى.
 */
export function Products() {
  return (
    <SectionShell size="tall">
      <div id="products" className="mx-auto w-full max-w-[1400px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: EASE.outExpo }}
          className="mb-14 max-w-[52ch]"
        >
          <span className="mb-5 flex items-center gap-3 text-xs tracking-[0.16em] text-body-muted">
            <span className="h-px w-10 bg-brand-fill" />
            منتجاتنا
          </span>
          <h2 className="font-display text-display-3 leading-[1.2] text-body">
            شغل تشوفه قبل لا تطلبه.
          </h2>
          <p className="mt-5 text-lg leading-[1.85] text-body-muted">
            كل صورة تحت من إنتاج المصنع فعلاً — مو صور جاهزة من الإنترنت.
          </p>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product, index) => (
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
              whileHover={{ y: -8, scale: 1.015 }}
              className="group overflow-hidden rounded-2xl border border-edge-strong bg-panel/70 shadow-[0_0_0_rgba(0,0,0,0)] transition-shadow duration-300 ease-out hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.85)]"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={`/products/${product.folder}/01.webp`}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/80 via-ink-950/10 to-transparent" />
                <span className="absolute bottom-4 start-4 rounded-full bg-page/80 px-3 py-1 text-[0.7rem] text-body-muted backdrop-blur">
                  {product.images} صور
                </span>
              </div>

              <div className="p-6">
                <p className="text-xs tracking-[0.12em] text-brand">{product.line}</p>
                <h3 className="mt-2 text-xl text-body">{product.name}</h3>
                <p className="mt-3 text-sm leading-[1.85] text-body-muted">{product.body}</p>
              </div>
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
