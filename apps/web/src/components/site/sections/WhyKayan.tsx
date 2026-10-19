'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { WHY_KAYAN } from '@/site';

/**
 * ليش كيان — «لوحة الأسباب».
 *
 * بطلب المالك تغيّر القسم كلياً: كان صفوفاً تتفتّح واحداً واحداً بأرقام ضخمة،
 * فلا يُقرأ إلا سبب في المرة. الآن: صورة حقيقية من المعمل ثابتة على جنب،
 * وبجانبها الأسباب الخمسة كلها ظاهرة — أيقونة صغيرة وعنوان وسطر — تُقرأ بنظرة.
 * الحركة تشتغل وحدها: الصورة تنكشف، والأسباب تظهر واحداً بعد الآخر.
 */

/** أيقونات خطّية صغيرة بلون العلامة — واحدة لكل سبب. */
const ICONS: Record<string, React.ReactNode> = {
  // مقصّ: الخياطة والطباعة والتطريز بمعملنا
  inhouse: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
    </>
  ),
  // عين: تشوف العيّنة قبل الكمية
  sample: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // درع: خامات مجرّبة تتحمّل
  materials: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  // سهم نازل: السعر ينزل مع الكمية
  volume: (
    <>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M21 11v6h-6" />
    </>
  ),
  // تقويم: التزام بالموعد
  delivery: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
    </>
  ),
};

export function WhyKayan({ t }: { t: Record<string, string> }) {
  return (
    <SectionShell size="tall">
      <div id="why" className="mx-auto grid w-full max-w-[1200px] gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        {/* الصورة + العنوان — ثابتة بجانب الأسباب على الكمبيوتر. */}
        <div className="lg:sticky lg:top-28">
          <span className="mb-5 inline-flex items-center gap-2.5 rounded-full bg-brand-fill/15 px-4 py-2 text-sm font-bold text-brand md:text-base">
            <span className="h-2 w-2 rounded-full bg-brand-fill" />
            ليش كيان
          </span>
          <h2
            className="font-display font-semibold text-body"
            style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.8rem)', lineHeight: 1.3, maxWidth: '18ch', textWrap: 'balance' }}
          >
            خمسة أسباب تخليك ترتاح للطلب.
          </h2>

          <motion.div
            initial={{ opacity: 0, clipPath: 'inset(12% 0 12% 0 round 24px)' }}
            whileInView={{ opacity: 1, clipPath: 'inset(0% 0 0% 0 round 24px)' }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.9, ease: EASE.outExpo }}
            className="relative mt-7 aspect-[4/3] overflow-hidden rounded-[24px] border border-edge-strong bg-panel-2"
          >
            <Image
              src="/why/vests.webp"
              alt="يلكات من إنتاج معمل كيان بثلاثة ألوان"
              fill
              sizes="(max-width: 1024px) 100vw, 520px"
              className="object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5">
              <p className="text-sm font-semibold text-white">خياطة وطباعة وتطريز — كلها بمعملنا.</p>
            </div>
          </motion.div>
        </div>

        {/* الأسباب الخمسة — كلها ظاهرة، تُقرأ بنظرة. */}
        <ul className="divide-y divide-edge rounded-[24px] border border-edge-strong bg-panel/60 px-5 md:px-8">
          {WHY_KAYAN.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.6, ease: EASE.outExpo, delay: i * 0.08 }}
              className="flex items-start gap-4 py-6 md:gap-5 md:py-7"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-fill/12 text-brand">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONS[item.id]}
                </svg>
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold leading-[1.4] text-body md:text-xl">
                  {t[`why.${item.id}.title`] ?? item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-[1.9] text-body-muted md:text-[0.95rem]">
                  {t[`why.${item.id}.body`] ?? item.body}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
