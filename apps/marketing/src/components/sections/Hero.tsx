'use client';

import { motion } from 'motion/react';
import { BRAND } from '@erp/brand';
import { EASE } from '@erp/motion';
import { MagneticButton, SceneAnchor } from '@erp/ui-market';

/**
 * الواجهة الرئيسية — Hero.
 *
 * المشهد ثلاثي الأبعاد يجمّع ٨٬٤٠٠ نقطة متناثرة في نسيج منتظم: خيط يصبح
 * قماشاً، وهو ما يفعله المصنع فعلياً.
 *
 * Arabic headline is animated per-word rather than per-character —
 * Arabic is a connected script, so splitting characters breaks the joins.
 */

const WORDS = ['كل', 'علامة', 'ناجحة'];

export function Hero() {
  return (
    <SceneAnchor scene="hero" className="relative min-h-[175vh]" offset={['start start', 'end end']}>
      <div id="top" className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.25]" />
        {/* تعتيم متدرج يحافظ على وضوح النص فوق النسيج */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,var(--color-ink-950)_76%)]" />

        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.15 }}
            className="mb-7 flex items-center gap-3 text-xs tracking-[0.18em] text-neutral-400"
          >
            <span className="h-px w-10 bg-accent" />
            مصنع كيان للزي الموحد والطباعة والتطريز
          </motion.div>

          <h1 className="max-w-[16ch] font-display text-display-1 leading-[1.12] text-neutral-100">
            {WORDS.map((word, index) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE.outExpo, delay: 0.3 + index * 0.12 }}
                className="inline-block"
              >
                {word}&nbsp;
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: EASE.outExpo, delay: 0.72 }}
              className="inline-block text-accent"
            >
              تبدأ بكيان
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.95 }}
            className="mt-8 max-w-[52ch] text-lead leading-loose text-neutral-300"
          >
            نصنّع الزي الموحد ونقدّم خدمات الطباعة والتطريز داخل مصنعنا — لأن ما يرتديه فريقك هو
            أول ما يراه عميلك.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 1.1 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <MagneticButton href="#contact">اطلب عرض سعر</MagneticButton>
            <MagneticButton href="/login" variant="outline">
              دخول النظام
            </MagneticButton>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.45 }}
            className="mt-16 hidden gap-12 border-t border-ink-800 pt-6 md:flex"
          >
            {[
              { label: 'خامات', value: 'ممتازة' },
              { label: 'ستايلات', value: 'عصرية' },
              { label: 'التنفيذ', value: 'تطريز وطباعة' },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[0.7rem] tracking-[0.14em] text-neutral-500">{item.label}</dt>
                <dd className="mt-1.5 font-display text-sm text-neutral-200">{item.value}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.7 }}
          className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-[0.7rem] tracking-[0.16em] text-neutral-500"
        >
          <span>مرّر لأسفل</span>
          <motion.span
            animate={{ scaleY: [0.2, 1, 0.2], originY: 0 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="block h-8 w-px bg-neutral-600"
          />
        </motion.div>
      </div>

      <span className="sr-only">
        {BRAND.nameAr} — {BRAND.tagline.ar}
      </span>
    </SceneAnchor>
  );
}
