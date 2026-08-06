'use client';

import { CountingNumber, SectionShell, MagneticButton, AnimatedText } from '@erp/ui-market';

const FIGURES = [
  { value: 4, suffix: '', label: 'Production archetypes, natively modelled', decimals: 0 },
  { value: 130, suffix: '', label: 'Tables designed before a line of schema', decimals: 0 },
  { value: 100, suffix: '%', label: 'Branch coverage required on the ledger', decimals: 0 },
  { value: 5, suffix: '%', label: 'Target variance, computed cost vs actual', decimals: 0 },
];

/**
 * Act V — The Proof.
 * Interaction grammar: typographic, near-zero chrome, numbers counting on
 * intersection. The calmest moment on the page, immediately before the CTA
 * (07_UI_UX §4.5) — a visitor ready to convert should not compete with motion.
 */
export function Proof() {
  return (
    <SectionShell id="cta" act="Act V" label="The Proof" size="tall">
      <div className="mx-auto w-full max-w-[1400px]">
        <dl className="grid gap-x-8 gap-y-12 border-t border-ink-800 pt-14 sm:grid-cols-2 lg:grid-cols-4">
          {FIGURES.map((figure) => (
            <div key={figure.label}>
              <dd className="font-display text-display-3 leading-none text-neutral-100">
                <CountingNumber
                  value={figure.value}
                  decimals={figure.decimals}
                  suffix={figure.suffix}
                />
              </dd>
              <dt className="mt-4 max-w-[24ch] text-sm leading-relaxed text-neutral-400">
                {figure.label}
              </dt>
            </div>
          ))}
        </dl>

        <div className="rule-hairline my-20" />

        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-[18ch] font-display text-display-2 leading-[0.98] text-neutral-100">
            <AnimatedText text="See it costed on your own job." by="word" />
          </h2>
          <div className="flex flex-wrap gap-4">
            <MagneticButton href="/contact">Request a demo</MagneticButton>
            <MagneticButton href="/platform" variant="outline">
              Explore the platform
            </MagneticButton>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
