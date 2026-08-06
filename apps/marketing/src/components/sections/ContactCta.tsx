'use client';

import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { MagneticButton, SectionShell } from '@erp/ui-market';

/**
 * قسم التواصل الختامي.
 *
 * أهدأ لحظة في الصفحة عن قصد — الزائر المستعد لطلب عرض سعر لا يجب أن ينافس
 * حركةً على انتباهه.
 *
 * ⚠ Contact details (address, phone, WhatsApp, hours) have not been supplied
 * by the client, so none are invented here. The section routes to the
 * existing enquiry form instead of showing a fabricated phone number.
 */
export function ContactCta() {
  return (
    <SectionShell id="contact" label="تواصل معنا" size="tall" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="rule-hairline mb-16" />

        <div className="flex flex-col items-start gap-10 lg:flex-row lg:items-end lg:justify-between">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.9, ease: EASE.outExpo }}
          >
            <h2 className="max-w-[20ch] font-display text-display-2 leading-[1.25] text-neutral-100">
              احكِ لنا عن <span className="text-accent">طلبك</span>
            </h2>
            <p className="mt-6 max-w-[52ch] text-base leading-loose text-neutral-400">
              عدد القطع، نوع الزي، وشعارك — ونرجع لك بعرض سعر واضح ومواعيد تسليم محددة.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE.outExpo, delay: 0.15 }}
            className="flex flex-wrap gap-4"
          >
            <MagneticButton href="/contact">اطلب عرض سعر</MagneticButton>
            <MagneticButton href="/login" variant="outline">
              دخول النظام
            </MagneticButton>
          </motion.div>
        </div>
      </div>
    </SectionShell>
  );
}
