'use client';

import { useRef } from 'react';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
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

        <div className="grid gap-4 md:gap-5 md:grid-cols-2">
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

  // بريق نبيتيّ يتبع المؤشّر — بلا ميل ثلاثيّ ولا رقم شبحيّ خلف النص (كانا
  // يزحمان البطاقة ويُخفيان النص في الوضع الفاتح).
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--gy', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: EASE.outExpo, delay: index * 0.08 }}
      className="group/svc relative overflow-hidden rounded-[26px] border border-edge-strong bg-panel/60 p-8 transition-colors duration-500 md:p-10"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 [@media(hover:hover)]:group-hover/svc:opacity-100"
        style={{
          background:
            'radial-gradient(230px 230px at var(--gx,50%) var(--gy,50%), color-mix(in srgb, var(--color-brand-fill) 22%, transparent), transparent 65%)',
        }}
      />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-fill/30 px-3 py-1 text-xs font-semibold text-brand">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-fill" />
          خدمة {idx(index + 1)}
        </span>
        <h3 className="mt-5 font-display text-2xl font-bold leading-[1.3] text-body md:text-[1.7rem]">
          {title}
        </h3>
        <p className="mt-3 max-w-[46ch] text-sm leading-[2] text-body-muted">{body}</p>
      </div>
    </motion.div>
  );
}
