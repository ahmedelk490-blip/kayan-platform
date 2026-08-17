'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell, AnimatedText } from '@erp/ui-market';
import { SERVICES } from '@/site';

/**
 * الخدمات.
 *
 * ألواح تدخل من جهة البداية — حركة مختلفة عن شبكة المنتجات فوقها، حتى لا
 * يقرأ القسمان كأنهما قسم واحد طويل.
 */
export function Services({ t }: { t: (key: string) => string }) {
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
          <span className="mb-5 flex items-center gap-3 text-xs tracking-[0.16em] text-body-muted">
            <span className="h-px w-10 bg-brand-fill" />
            الطباعة والتطريز
          </span>
          <AnimatedText
            as="h2"
            text="شعارك على القماش، بيدنا من البداية للنهاية."
            className="font-display text-display-3 leading-[1.2] text-body"
          />
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2">
          {SERVICES.map((service, index) => (
            <motion.article
              key={service.id}
              // Enters from the start edge — a different axis from the
              // products grid above, so the two sections do not read as one
              // long strip repeating itself.
              initial={{ opacity: 0, x: 28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.75, ease: EASE.outExpo, delay: index * 0.09 }}
              className="group relative overflow-hidden rounded-2xl border border-edge-strong bg-panel/70 p-8 transition-colors hover:border-brand/50"
            >
              {/* The marker lands first, the words follow it — confident
                  rather than playful, which is the tone this section wants. */}
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE.outExpo, delay: index * 0.09 + 0.12 }}
                className="tnum inline-block text-xs text-brand"
              >
                {String(index + 1).padStart(2, '0')}
              </motion.span>

              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: EASE.outExpo, delay: index * 0.09 + 0.2 }}
                className="mt-4 text-xl text-body"
              >
                {t(`service.${service.id}.name`)}
              </motion.h3>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: EASE.outExpo, delay: index * 0.09 + 0.28 }}
                className="mt-3 max-w-[46ch] text-sm leading-[1.9] text-body-muted"
              >
                {t(`service.${service.id}.body`)}
              </motion.p>
              {/* خط يمتد عند المرور — حركة صغيرة تكفي */}
              <span className="absolute bottom-0 start-0 h-px w-0 bg-brand-fill transition-all duration-500 ease-out group-hover:w-full" />
            </motion.article>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
