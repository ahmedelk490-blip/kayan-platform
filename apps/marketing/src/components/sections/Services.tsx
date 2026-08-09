'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { SERVICES } from '@/site';

/**
 * الخدمات.
 *
 * ألواح تدخل من جهة البداية — حركة مختلفة عن شبكة المنتجات فوقها، حتى لا
 * يقرأ القسمان كأنهما قسم واحد طويل.
 */
export function Services() {
  return (
    <SectionShell size="tall">
      <div id="services" className="mx-auto w-full max-w-[1400px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: EASE.outExpo }}
          className="mb-14 max-w-[52ch]"
        >
          <span className="mb-5 flex items-center gap-3 text-xs tracking-[0.16em] text-neutral-400">
            <span className="h-px w-10 bg-accent" />
            الطباعة والتطريز
          </span>
          <h2 className="font-display text-display-3 leading-[1.2] text-neutral-100">
            شعارك على القماش، بيدنا من البداية للنهاية.
          </h2>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2">
          {SERVICES.map((service, index) => (
            <motion.article
              key={service.id}
              initial={{ opacity: 0, x: 28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.75, ease: EASE.outExpo, delay: index * 0.09 }}
              className="group relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/60 p-8 transition-colors hover:border-accent/50"
            >
              <span className="tnum text-xs text-accent">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 text-xl text-neutral-100">{service.name}</h3>
              <p className="mt-3 max-w-[46ch] text-sm leading-[1.9] text-neutral-400">
                {service.body}
              </p>
              {/* خط يمتد عند المرور — حركة صغيرة تكفي */}
              <span className="absolute bottom-0 start-0 h-px w-0 bg-accent transition-all duration-500 ease-out group-hover:w-full" />
            </motion.article>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
