'use client';

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { EASE, usePrefersReducedMotion } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { SectionHeading } from '@/components/site/SectionHeading';
import { SERVICES } from '@/site';

const idx = (n: number) =>
  new Intl.NumberFormat('ar-EG', { minimumIntegerDigits: 2 }).format(n);

/**
 * الخدمات — ألواح زجاجية تميل نحو المؤشّر.
 *
 * فكرة مختلفة عن «سِجِلّ الضوء» أسفلها: هنا كل خدمة لوحٌ ثلاثيّ الأبعاد يميل
 * ناحية المؤشّر، ويمرّ عليه بريقٌ نبيتيّ يتبع الإصبع، خلف نصّه رقمٌ ضخم شبحيّ.
 * ملموسٌ كبطاقة معدنية تُقلَّب في اليد — لا شبكة ثابتة. اللون النبيتيّ وحده.
 */
export function Services({ t }: { t: Record<string, string> }) {
  return (
    <SectionShell size="tall">
      <div id="services" className="mx-auto w-full max-w-[1400px]">
        <SectionHeading
          eyebrow="الطباعة والتطريز"
          title="شعارك على القماش، بيدنا من البداية للنهاية."
        />

        <div className="grid gap-4 md:gap-5 md:grid-cols-2" style={{ perspective: '1400px' }}>
          {SERVICES.map((service, index) => (
            <ServiceCard
              key={service.id}
              index={index}
              title={t[`service.${service.id}.name`]}
              body={t[`service.${service.id}.body`]}
            />
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function ServiceCard({ index, title, body }: { index: number; title: string; body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [hover, setHover] = useState(false);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || reduced) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    // ميلٌ لطيف نحو المؤشّر + موضع البريق كنسبة مئوية.
    setTilt({ rx: (0.5 - py) * 9, ry: (px - 0.5) * 11 });
    el.style.setProperty('--gx', `${px * 100}%`);
    el.style.setProperty('--gy', `${py * 100}%`);
  };
  const reset = () => {
    setHover(false);
    setTilt({ rx: 0, ry: 0 });
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={reset}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: EASE.outExpo, delay: index * 0.08 }}
      className="group/svc relative overflow-hidden rounded-[26px] border border-white/10 p-8 md:p-10"
      style={{
        transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transformStyle: 'preserve-3d',
        transition: hover ? 'transform 0.08s linear, border-color 0.5s' : 'transform 0.5s ease, border-color 0.5s',
        borderColor: hover ? 'color-mix(in srgb, var(--color-brand-fill) 45%, transparent)' : undefined,
        background: 'linear-gradient(150deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008) 60%, transparent)',
      }}
    >
      {/* بريق نبيتيّ يتبع المؤشّر داخل اللوح. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/svc:opacity-100"
        style={{
          background:
            'radial-gradient(230px 230px at var(--gx,50%) var(--gy,50%), color-mix(in srgb, var(--color-brand-fill) 30%, transparent), transparent 65%)',
        }}
      />

      {/* رقم شبحيّ ضخم خلف النص. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -start-2 select-none font-display font-bold leading-none"
        style={{
          fontSize: 'clamp(6rem, 14vw, 11rem)',
          color: 'transparent',
          WebkitTextStroke: '1px color-mix(in srgb, var(--color-brand-fill) 16%, transparent)',
        }}
      >
        {idx(index + 1)}
      </span>

      {/* إطار نبيتيّ رفيع يُرسم عند المرور. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-3 rounded-[20px] border border-brand-fill/0 transition-colors duration-500 group-hover/svc:border-brand-fill/25"
      />

      <div className="relative" style={{ transform: 'translateZ(40px)' }}>
        <span
          className="inline-flex items-center gap-2 rounded-full border border-brand-fill/30 px-3 py-1 text-[0.7rem] font-semibold tracking-wide text-brand"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-fill" />
          خدمة {idx(index + 1)}
        </span>
        <h3 className="mt-5 font-display text-2xl font-bold leading-[1.2] text-body md:text-[1.7rem]">
          {title}
        </h3>
        <p className="mt-3 max-w-[46ch] text-sm leading-[2] text-body-muted">{body}</p>
      </div>
    </motion.div>
  );
}
