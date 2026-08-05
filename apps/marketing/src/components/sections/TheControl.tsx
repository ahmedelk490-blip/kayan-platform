'use client';

import { motion } from 'motion/react';
import { EASE, staggerChildren } from '@erp/motion';
import { AnimatedText, SectionShell } from '@erp/ui-market';

const LEDGER = [
  { time: '09:14', event: 'Goods receipt GR-2291', detail: 'Lot LT-4471 · 480 m² · layer opened', tone: 'accent' },
  { time: '09:14', event: 'Journal JE-8842 posted', detail: 'Dr Inventory 27,840.00 · Cr GRNI 27,840.00', tone: 'muted' },
  { time: '11:02', event: 'Work order WO-1180 released', detail: 'Artwork approved by customer · gate passed', tone: 'accent' },
  { time: '13:47', event: 'Stock issue', detail: 'FIFO consumed layer LT-4471 · 212 m² @ 58.00', tone: 'muted' },
  { time: '16:20', event: 'Cost sheet CS-2026-0001 issued', detail: 'Cost/unit 142.41 · margin 31.4%', tone: 'accent' },
];

/**
 * Act III — The Control.
 * Interaction grammar: staggered reveal of a live-feeling ledger. Static
 * composition, no scroll-coupling — a deliberate rest after the pinned
 * horizontal travel of Act II.
 */
export function TheControl() {
  return (
    <SectionShell id="control" act="Act III" label="The Control" size="tall">
      <div className="mx-auto grid w-full max-w-[1400px] gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <h2 className="max-w-[18ch] font-display text-display-3 leading-[1.05] text-steel-100">
            <AnimatedText text="Every department, posting to one ledger" by="word" />
          </h2>
          <p className="mt-6 max-w-[46ch] text-lead leading-relaxed text-steel-400">
            Nothing is entered twice. A goods receipt moves stock, opens a cost layer and writes
            its journal entry in the same transaction — so the trial balance is never a
            reconciliation exercise.
          </p>

          <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-steel-800 pt-8">
            {[
              { k: 'Postings', v: 'Append-only' },
              { k: 'Corrections', v: 'By reversal' },
              { k: 'Valuation', v: 'WAC · FIFO · Specific' },
              { k: 'Traceability', v: 'Issue → receipt' },
            ].map((item) => (
              <div key={item.k}>
                <dt className="text-[0.65rem] uppercase tracking-[0.18em] text-steel-500">
                  {item.k}
                </dt>
                <dd className="mt-1.5 font-display text-sm text-steel-200">{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-12% 0px' }}
          variants={staggerChildren(0.09)}
          className="overflow-hidden rounded-2xl border border-steel-800 bg-steel-900/60"
        >
          <div className="flex items-center gap-2 border-b border-steel-800 px-5 py-3.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-steel-400">
              Activity · 05 Aug 2026
            </span>
          </div>

          <ul className="divide-y divide-steel-800/70">
            {LEDGER.map((row) => (
              <motion.li
                key={row.event}
                variants={{
                  hidden: { opacity: 0, x: -12 },
                  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE.outExpo } },
                }}
                className="flex gap-4 px-5 py-4"
              >
                <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-steel-500">
                  {row.time}
                </span>
                <span className="min-w-0">
                  <span
                    className={
                      row.tone === 'accent'
                        ? 'block text-sm text-accent'
                        : 'block text-sm text-steel-200'
                    }
                  >
                    {row.event}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-steel-500">{row.detail}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>
    </SectionShell>
  );
}
