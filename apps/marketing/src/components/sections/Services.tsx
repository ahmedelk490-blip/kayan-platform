'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { SERVICES } from '@/site';

/**
 * الطباعة والتطريز — the two services done in-house.
 *
 * Motion grammar deliberately differs from Products above: instead of a grid
 * stagger, each service enters from the inline edge as a wide panel. Two
 * consecutive sections must not feel visually similar.
 */
export function Services() {
  return (
    <SectionShell id="services" label="الطباعة والتطريز" size="tall" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1400px]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.9, ease: EASE.outExpo }}
          className="mb-14 max-w-[48ch]"
        >
          <h2 className="font-display text-display-3 leading-[1.3] text-neutral-100">
            شعارك على القماش — <span className="text-accent">داخل مصنعنا</span>
          </h2>
          <p className="mt-5 text-base leading-loose text-neutral-400">
            لا نرسل التطريز أو الطباعة إلى ورش خارجية. التنفيذ كامل تحت سقف واحد، وهو ما يجعل
            التسليم أسرع والجودة أثبت.
          </p>
        </motion.div>

        <div className="space-y-6">
          {SERVICES.map((service, index) => (
            <motion.article
              key={service.id}
              initial={{ opacity: 0, x: 48 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.9, ease: EASE.outExpo, delay: index * 0.15 }}
              className="grid gap-8 rounded-2xl border border-ink-800 bg-ink-900/40 p-8 md:grid-cols-[0.8fr_1.2fr] md:p-12"
            >
              <div>
                <span className="font-display text-5xl text-primary-800">
                  {index === 0 ? '٠١' : '٠٢'}
                </span>
                <h3 className="mt-5 font-display text-3xl text-neutral-100">{service.name}</h3>
                <p className="mt-2 text-sm text-accent">{service.tagline}</p>
              </div>

              <div>
                <p className="text-base leading-loose text-neutral-300">{service.body}</p>

                <ul className="mt-7 space-y-3 border-t border-ink-800 pt-6">
                  {service.points.map((point, pointIndex) => (
                    <motion.li
                      key={point}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 0.6,
                        ease: EASE.outExpo,
                        delay: 0.3 + pointIndex * 0.1,
                      }}
                      className="flex items-start gap-3 text-sm leading-loose text-neutral-400"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      />
                      {point}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
