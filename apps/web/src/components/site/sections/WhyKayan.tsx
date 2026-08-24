'use client';

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { EASE, usePrefersReducedMotion } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { SectionHeading } from '@/components/site/SectionHeading';
import { WHY_KAYAN } from '@/site';

/** رقم عربي-هندي بخانتين: ٠١، ٠٢ … — للفهرس الفاخر. */
const idx = (n: number) =>
  new Intl.NumberFormat('ar-EG', { minimumIntegerDigits: 2 }).format(n);

/**
 * ليش كيان — «سِجِلّ الضوء».
 *
 * ليست قائمة خطوط بعد الآن. كل سبب صفٌّ زجاجيّ؛ الصفّ النشط يتفتّح فيكبر رقمه
 * (أرقام نبيتيّة معدنية) ويتوهّج خلفه ضوء نبيتيّ، وبقيّة الصفوف تنكمش إلى
 * أشرطة رفيعة — إيقاع أوبرالي لا جدول. وضوءٌ نبيتيّ يتبع المؤشّر عبر القسم
 * كلّه. اللون النبيتيّ وحده — لا ذهب (سُحب بتوجيه العلامة).
 *
 * على سطح المكتب: المرور يفعّل الصفّ. على الجوال: التمرير يفعّله واحداً تلو
 * الآخر. ومع «تقليل الحركة» تنفتح كل الأسباب بلا حركة.
 */
export function WhyKayan({ t }: { t: Record<string, string> }) {
  const [active, setActive] = useState(0);
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <SectionShell size="tall">
      <div id="why" className="mx-auto w-full max-w-[1400px]">
        <SectionHeading eyebrow="ليش كيان" title="خمسة أسباب تخليك ترتاح للطلب." />

        <div
          ref={ref}
          onMouseMove={onMove}
          className="group/why relative mt-14 md:mt-20"
        >
          {/* ضوء نبيتيّ يتبع المؤشّر — يظهر فقط عند المرور فوق القسم. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-[40px] opacity-0 transition-opacity duration-700 group-hover/why:opacity-100"
            style={{
              background:
                'radial-gradient(360px 360px at var(--mx, 50%) var(--my, 30%), color-mix(in srgb, var(--color-brand-fill) 26%, transparent), transparent 68%)',
            }}
          />

          <ol className="relative flex flex-col gap-3 md:gap-4">
            {WHY_KAYAN.map((item, i) => {
              const on = i === active;
              const open = reduced || on;
              return (
                <motion.li
                  key={item.id}
                  layout
                  onMouseEnter={() => setActive(i)}
                  onViewportEnter={() => setActive(i)}
                  viewport={{ amount: 0.8 }}
                  onClick={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  tabIndex={0}
                  transition={{ layout: { duration: 0.6, ease: EASE.outExpo } }}
                  className={[
                    'group/row relative cursor-default overflow-hidden rounded-[28px] border px-6 py-6 outline-none transition-[border-color,background-color,box-shadow] duration-500 md:px-10 md:py-8',
                    on
                      ? 'border-[color-mix(in_srgb,var(--color-brand-fill)_42%,transparent)] shadow-[0_40px_90px_-46px_rgba(92,35,52,0.85)]'
                      : 'border-white/[0.06] hover:border-white/[0.12]',
                  ].join(' ')}
                  style={
                    on
                      ? {
                          background:
                            'linear-gradient(110deg, color-mix(in srgb, var(--color-brand-fill) 16%, transparent), color-mix(in srgb, var(--color-brand-fill) 4%, transparent) 55%, transparent)',
                        }
                      : { background: 'rgba(255,255,255,0.014)' }
                  }
                >
                  {/* هالة نبيتيّة خلف الرقم في الصفّ النشط. */}
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute -top-10 bottom-0 end-0 w-[42%] transition-opacity duration-700 ${on ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                      background:
                        'radial-gradient(60% 70% at 78% 40%, color-mix(in srgb, var(--color-brand-fill) 30%, transparent), transparent 70%)',
                    }}
                  />
                  {/* شريط ضوئيّ رفيع على حافّة البداية يرتفع مع التفعيل. */}
                  <motion.span
                    aria-hidden
                    initial={false}
                    animate={{ scaleY: on ? 1 : 0 }}
                    transition={{ duration: 0.6, ease: EASE.outExpo }}
                    className="absolute inset-y-4 end-0 w-[3px] origin-top rounded-full"
                    style={{
                      background:
                        'linear-gradient(to bottom, transparent, var(--color-brand-fill), transparent)',
                    }}
                  />

                  <div className="relative flex items-start gap-5 md:gap-9">
                    {/* الرقم: مُفرَّغ حين ساكن، ممتلئ بتدرّج نبيتيّ معدنيّ حين نشط. */}
                    <motion.span
                      aria-hidden
                      layout
                      animate={{ scale: on ? 1 : 0.82, opacity: on ? 1 : 0.5 }}
                      transition={{ duration: 0.6, ease: EASE.outExpo }}
                      className="shrink-0 select-none font-display font-bold leading-[0.8] tracking-tight"
                      style={{
                        fontSize: 'clamp(2.6rem, 8vw, 6rem)',
                        WebkitTextStroke: on
                          ? '0'
                          : '1.4px color-mix(in srgb, var(--color-brand-fill) 55%, transparent)',
                        color: on ? 'transparent' : 'transparent',
                        backgroundImage: on
                          ? 'linear-gradient(160deg, var(--color-primary-300), var(--color-brand-fill) 55%, var(--color-primary-800))'
                          : 'none',
                        WebkitBackgroundClip: on ? 'text' : 'border-box',
                        backgroundClip: on ? 'text' : 'border-box',
                        filter: on
                          ? 'drop-shadow(0 12px 34px rgba(92,35,52,0.55))'
                          : 'none',
                      }}
                    >
                      {idx(i + 1)}
                    </motion.span>

                    <div className="flex-1 pt-1 md:pt-3">
                      <motion.h3
                        layout="position"
                        className={`font-display font-bold leading-[1.15] transition-colors duration-500 ${
                          on ? 'text-body' : 'text-body-muted'
                        }`}
                        style={{ fontSize: on ? 'clamp(1.5rem, 3.4vw, 2.35rem)' : 'clamp(1.15rem, 2.4vw, 1.55rem)' }}
                      >
                        {t[`why.${item.id}.title`]}
                      </motion.h3>

                      {/* الجسد: يتفتّح للصفّ النشط فقط (أكورديون). */}
                      <motion.div
                        initial={false}
                        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
                        transition={{ duration: 0.55, ease: EASE.outExpo }}
                        className="overflow-hidden"
                      >
                        <p className="mt-3 max-w-[60ch] text-[0.95rem] leading-[2] text-body-muted md:mt-4 md:text-base">
                          {t[`why.${item.id}.body`]}
                        </p>
                      </motion.div>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ol>

          {/* مؤشّر تقدّم: خمس نقاط تضيء مع الصفّ النشط. */}
          <div className="mt-8 flex items-center justify-center gap-2.5" aria-hidden>
            {WHY_KAYAN.map((item, i) => (
              <motion.span
                key={item.id}
                animate={{
                  width: i === active ? 26 : 7,
                  opacity: i === active ? 1 : 0.35,
                }}
                transition={{ duration: 0.5, ease: EASE.outExpo }}
                className="h-[7px] rounded-full"
                style={{ backgroundColor: 'var(--color-brand-fill)' }}
              />
            ))}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
