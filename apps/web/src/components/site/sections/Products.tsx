'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell, AnimatedText } from '@erp/ui-market';
import { ImageReveal } from '@/components/site/Parallax';
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
          {/* Masked line reveal rather than a fade: the words rise out from
              behind a clip, which reads as typeset rather than as loading.
              AnimatedText keeps the whole string as one accessible label —
              splitting it per word in the tree makes a screen reader announce
              a headline one word at a time. */}
          <AnimatedText
            as="h2"
            text="شغل تشوفه قبل لا تطلبه."
            className="font-display text-display-3 leading-[1.2] text-body"
          />
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
              // Spring rather than a tween on hover: a card that settles reads
              // as a physical object, where a linear ease reads as a slide.
              // The spring lives INSIDE whileHover so it applies to the hover
              // only — the entrance keeps its own eased timing above.
              whileHover={{
                y: -8,
                scale: 1.015,
                transition: { type: 'spring', stiffness: 320, damping: 24 },
              }}
              className="group overflow-hidden rounded-2xl border border-edge-strong bg-panel/70 shadow-[0_0_0_rgba(0,0,0,0)] transition-shadow duration-300 ease-out hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.85)]"
            >
              <ImageReveal delay={(index % 3) * 0.08} className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={`/products/${product.folder}/01.webp`}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/80 via-ink-950/10 to-transparent" />
                {/* لمعة تمرّ مرة واحدة عند المرور — لا تدور بلا نهاية */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/12 to-transparent transition-transform duration-[900ms] ease-out group-hover:translate-x-full" />
                <span className="absolute bottom-4 start-4 rounded-full bg-page/80 px-3 py-1 text-[0.7rem] text-body-muted backdrop-blur">
                  {product.images} صور
                </span>
              </ImageReveal>

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
