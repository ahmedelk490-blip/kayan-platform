'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { MagneticButton } from '@erp/ui-market';

/**
 * الواجهة الرئيسية — Hero.
 *
 * صور منتجات حقيقية من المصنع، لا مشهد ثلاثي الأبعاد. الزائر يشتري قماشاً
 * وخياطة، فأقوى ما يُعرض عليه هو القماش والخياطة نفسها.
 *
 * The previous hero rendered an 8,400-point WebGL fabric weave. It was
 * handsome and it cost ~290 kB before a visitor could see a single product.
 * Photographs of the actual output sell this factory better, and the whole
 * three.js runtime is now off the homepage entirely.
 *
 * العنوان يتحرك كلمةً كلمة لا حرفاً حرفاً — العربية خط متصل، وتقطيع الحروف
 * يكسر الوصلات.
 */

const WORDS = ['زيّ', 'موحّد', 'يليق', 'باسمك'];

/** أربع صور حقيقية، كل وحدة من منتج مختلف. */
const SHOWCASE = [
  { src: '/products/vest-turkish/vest-turkish-001/01.webp', alt: 'يلك تركي بشرائط عاكسة', span: 'row-span-2' },
  { src: '/products/tshirts/tshirts-001/01.webp', alt: 'تيشيرت قطن قابل للطباعة والتطريز', span: '' },
  { src: '/products/aprons/aprons-001/01.webp', alt: 'مريلة عمل للمطاعم والكافيهات', span: '' },
  { src: '/products/vest-chinese/vest-chinese-001/02.webp', alt: 'يلك عمل للكميات الكبيرة', span: 'col-span-2' },
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
      <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.18]" />
      {/* توهّج بلون العلامة خلف الصور، يعطي عمقاً بلا صورة خلفية ثقيلة */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{ background: 'var(--color-accent)' }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] items-center gap-14 px-6 md:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-16">
        {/* ── النص ── */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE.outExpo }}
            className="mb-7 flex items-center gap-3 text-xs tracking-[0.16em] text-neutral-400"
          >
            <span className="h-px w-10 bg-accent" />
            مصنع كيان · زي موحد · طباعة · تطريز
          </motion.div>

          <h1 className="font-display text-display-1 leading-[1.15] text-neutral-100">
            {/* A real space between words, not a margin.
                Margin alone looks correct but leaves the markup as one
                unbroken string: assistive technology reads "زيموحديليقباسمك",
                and so does copy-paste. The space is the accessible part; the
                animation rides on top of it. */}
            {WORDS.map((word, index) => (
              <span key={word}>
                {index > 0 ? ' ' : ''}
                <motion.span
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.85, ease: EASE.outExpo, delay: 0.12 + index * 0.1 }}
                  className="inline-block"
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.5 }}
            className="mt-7 max-w-[46ch] text-lg leading-[1.85] text-neutral-300"
          >
            نشتغل معك من أول اختيار القماش لين آخر غرزة تطريز. يلكات، تيشيرتات،
            مرايل، قبعات، وزي المطاعم والصالات — مطبوع ومطرّز داخل مصنعنا، بجودة
            تثبت مع الغسيل المتكرر.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.62 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <MagneticButton>
              <Link
                href="#quote"
                className="inline-flex items-center rounded-full bg-accent px-8 py-4 text-sm font-medium text-ink-950 transition-opacity hover:opacity-90"
              >
                اطلب عرض سعر
              </Link>
            </MagneticButton>

            <Link
              href="#products"
              className="inline-flex items-center rounded-full border border-neutral-700 px-8 py-4 text-sm text-neutral-200 transition-colors hover:border-accent hover:text-accent"
            >
              تصفّح منتجاتنا
            </Link>
          </motion.div>
        </div>

        {/* ── الصور ── */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.11, delayChildren: 0.3 } } }}
          className="grid grid-cols-2 grid-rows-[190px_190px_190px] gap-3 sm:grid-rows-[230px_230px_230px] sm:gap-4"
        >
          {SHOWCASE.map((item) => (
            <motion.figure
              key={item.src}
              variants={{
                hidden: { opacity: 0, y: 30, scale: 0.97 },
                visible: { opacity: 1, y: 0, scale: 1 },
              }}
              transition={{ duration: 0.9, ease: EASE.outExpo }}
              whileHover={{ y: -6 }}
              className={`group relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 ${item.span}`}
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes="(max-width: 1024px) 45vw, 24vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                priority
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent" />
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
