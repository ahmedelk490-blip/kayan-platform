'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { SERVICES } from '@/site';

/**
 * الطباعة والتطريز — «اللوحة النبيتيّة».
 *
 * بطلب المالك تغيّر القسم كلياً. له غرفته الخاصة بين الأقسام: لوحة كاملة بلون
 * العلامة ونصّ أبيض (جاره «ليش كيان» محايد بصورة وقائمة). الخدمات الأربع
 * جنب بعض، لكلٍّ أيقونة وعنوان وسطر، وخطّ رفيع يُرسم فوقها حين تظهر — والحركة
 * تعمل وحدها بلا مرور.
 */

const ICONS: Record<string, React.ReactNode> = {
  // أسطوانة طباعة
  printing: (
    <>
      <rect x="3" y="4" width="14" height="6" rx="2" />
      <path d="M17 7h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-7v3" />
      <rect x="10" y="16" width="4" height="6" rx="1" />
    </>
  ),
  // إبرة وخيط
  embroidery: (
    <>
      <path d="M18 3 6 15" />
      <path d="M17 4.5a1.5 1.5 0 1 0 2.5-1.5" />
      <path d="M6 15c-3 1-3 5 0 6s5-2 3-4-6 1-5 3" />
    </>
  ),
  // قميص
  manufacturing: <path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c-1 2-2.5 3-4 3S9 5 8 3Z" />,
  // فريق
  solutions: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.7 2.6 3 5.2" />
    </>
  ),
};

export function Services({ t }: { t: Record<string, string> }) {
  return (
    <SectionShell>
      <div
        id="services"
        className="relative mx-auto w-full max-w-[1400px] overflow-hidden rounded-[32px] bg-brand-fill px-6 py-12 text-on-brand md:px-12 md:py-16"
      >
        {/* إضاءة خفيفة ثابتة في الزاوية تعطي اللوحة عمقاً بلا صورة ثقيلة. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 start-[-10%] h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-2.5 rounded-full bg-white/15 px-4 py-2 text-sm font-bold md:text-base">
              <span className="h-2 w-2 rounded-full bg-white" />
              الطباعة والتطريز
            </span>
            <h2
              className="mt-5 font-display font-semibold"
              style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.8rem)', lineHeight: 1.3, maxWidth: '20ch', textWrap: 'balance' }}
            >
              شعارك على القماش، بيدنا من البداية للنهاية.
            </h2>
          </div>
          <Link
            href="/quote"
            className="inline-flex items-center rounded-full bg-white px-7 py-3.5 text-sm font-bold text-brand shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)]"
          >
            اطلب عرض سعر
          </Link>
        </div>

        <ul className="relative mt-10 grid gap-4 sm:grid-cols-2 md:mt-12 lg:grid-cols-4">
          {SERVICES.map((service, i) => (
            <motion.li
              key={service.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.7, ease: EASE.outExpo, delay: i * 0.1 }}
              className="relative overflow-hidden rounded-[22px] border border-white/20 bg-white/[0.07] p-6"
            >
              {/* خطّ رفيع يُرسم أعلى البطاقة عند ظهورها. */}
              <motion.span
                aria-hidden
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: EASE.outExpo, delay: 0.2 + i * 0.1 }}
                className="absolute inset-x-6 top-0 h-[2px] origin-right rounded-full bg-white/70"
              />
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONS[service.id]}
                </svg>
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold leading-[1.4] md:text-xl">
                {t[`service.${service.id}.name`] ?? service.name}
              </h3>
              <p className="mt-2 text-sm leading-[1.9] text-white/80">
                {t[`service.${service.id}.body`] ?? service.body}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
