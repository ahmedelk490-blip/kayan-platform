'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { PRODUCTS } from '@/site';

/**
 * المنتجات — نُشرة المصنع.
 *
 * Motion: staggered card reveal on scroll, then a lift on hover. Nine cards
 * is a lot to enter at once, so the stagger is short (60ms) — long enough to
 * read as sequential, short enough not to make the visitor wait.
 *
 * ⚠ No product photography exists in the repository yet. Each card carries a
 * typographic plate rather than a fake image placeholder.
 */
export function Products() {
  return (
    <SectionShell id="products" label="منتجاتنا" size="tall" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1400px]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.9, ease: EASE.outExpo }}
          className="mb-14 max-w-[46ch]"
        >
          <h2 className="font-display text-display-3 leading-[1.3] text-neutral-100">
            ما نصنعه في <span className="text-accent">كيان</span>
          </h2>
          <p className="mt-5 text-base leading-loose text-neutral-400">
            تسعة خطوط إنتاج تغطي احتياجات المطاعم والشركات والمصانع والمنشآت الطبية — وكلها
            قابلة للطباعة والتطريز بشعارك.
          </p>
        </motion.div>

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product, index) => (
            <motion.li
              key={product.id}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, ease: EASE.outExpo, delay: (index % 3) * 0.06 }}
              className="group relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40 p-7 transition-colors duration-500 hover:border-primary-600"
            >
              {/* توهج خفيف يتبع المؤشر عند المرور */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--color-primary-600)_22%,transparent),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative">
                <span className="text-[0.7rem] tracking-[0.14em] text-neutral-500">
                  {product.line}
                </span>
                <h3 className="mt-2 font-display text-2xl text-neutral-100">{product.name}</h3>
                <p className="mt-3.5 text-sm leading-loose text-neutral-400">{product.body}</p>

                <span className="mt-6 flex items-center gap-2 text-xs text-accent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  اطلب عرض سعر
                  <span aria-hidden="true">←</span>
                </span>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
