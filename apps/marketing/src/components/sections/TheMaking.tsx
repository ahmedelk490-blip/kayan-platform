'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { AnimatedText } from '@erp/ui-market';

const STAGES = [
  {
    no: '01',
    title: 'Raw material',
    body: 'Fabric arrives by roll, substrate by sheet. Both are received against a purchase order, given a lot number, and priced into a cost layer.',
    meta: 'Received · lot LT-4471',
  },
  {
    no: '02',
    title: 'Printing',
    body: 'Screens are set, plates mounted. Setup cost is amortised across the run and spoilage is modelled — not guessed at after the fact.',
    meta: 'Screen · 2 colours',
  },
  {
    no: '03',
    title: 'Embroidery',
    body: 'The digitised file is a reusable asset, not an attachment. Cost is stitch count multiplied by head count, because that is what the machine actually charges you.',
    meta: '8,400 stitches · 12 heads',
  },
  {
    no: '04',
    title: 'Cut, make, trim',
    body: 'A 3XL consumes more fabric than a small. The bill of materials knows that, so large sizes stop quietly eating your margin.',
    meta: 'Size-dependent BOM',
  },
  {
    no: '05',
    title: 'Quality',
    body: 'Inspection gates pass, rework, or scrap. Rework is costed as its own stream so a good job and a repaired one never look alike.',
    meta: 'Gate · pass / rework / scrap',
  },
];

/**
 * Act II — The Making.
 * Interaction grammar: horizontal pinned travel. Vertical scroll becomes
 * lateral motion, breaking the page's vertical rhythm exactly once.
 *
 * Deliberately DOM-only: it follows the Hero's WebGL set piece and lets the
 * GPU rest (07_UI_UX §4.3).
 */
export function TheMaking() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  // TODO(RTL): mirror to positive percentages when dir="rtl" (07_UI_UX §7).
  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-72%']);
  const railWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section id="making" ref={ref} className="relative h-[420vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="mx-auto mb-12 w-full max-w-[1400px] px-6 md:px-10 lg:px-16">
          <div className="mb-6 flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-neutral-400">
            <span className="text-accent">Act II</span>
            <span className="h-px w-8 bg-ink-700" />
            <span>The Making</span>
          </div>
          <h2 className="max-w-[20ch] font-display text-display-3 leading-[1.05] text-neutral-100">
            <AnimatedText text="How raw material becomes a finished product" by="word" />
          </h2>
        </div>

        <motion.ol style={{ x }} className="flex gap-6 px-6 md:gap-8 md:px-10 lg:px-16">
          {STAGES.map((stage) => (
            <li
              key={stage.no}
              className="w-[78vw] shrink-0 rounded-2xl border border-ink-800 bg-ink-900/50 p-7 backdrop-blur-sm sm:w-[52vw] lg:w-[30vw]"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display text-4xl text-ink-700">{stage.no}</span>
                <span className="text-[0.65rem] uppercase tracking-[0.16em] text-accent">
                  {stage.meta}
                </span>
              </div>
              <h3 className="mt-6 font-display text-2xl text-neutral-100">{stage.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">{stage.body}</p>
            </li>
          ))}
        </motion.ol>

        <div className="mx-auto mt-12 w-full max-w-[1400px] px-6 md:px-10 lg:px-16">
          <div className="h-px w-full bg-ink-800">
            <motion.div style={{ width: railWidth }} className="h-px bg-accent" />
          </div>
        </div>
      </div>
    </section>
  );
}
