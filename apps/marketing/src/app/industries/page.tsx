import type { Metadata } from 'next';
import { SectionShell, AnimatedText } from '@erp/ui-market';
import { PageHero } from '@/components/PageHero';
import { CtaBand } from '@/components/CtaBand';
import { INDUSTRIES } from '@/site';

export const metadata: Metadata = {
  title: 'Industries — four archetypes, one system',
  description:
    'Printing, embroidery, uniform manufacturing and safety products have no shared costing model. Each is modelled natively.',
};

export default function IndustriesPage() {
  return (
    <>
      <PageHero
        eyebrow="Industries"
        title="Four businesses under one roof."
        lead="Printing is a job shop. Embroidery sells machine time. Uniforms are a variant matrix. Safety equipment is regulated distribution. No two share a costing model — which is why running all four on a generic ERP quietly loses money."
      />

      {INDUSTRIES.map((industry, index) => (
        <SectionShell
          key={industry.id}
          id={industry.id}
          act={`0${index + 1}`}
          label={industry.name}
          size="base"
          className="scroll-mt-20"
        >
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <h2 className="font-display text-display-3 leading-[1.05] text-neutral-100">
                  <AnimatedText text={industry.name} by="word" />
                </h2>
                <dl className="mt-8 space-y-5 border-t border-ink-800 pt-6">
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-500">
                      Production model
                    </dt>
                    <dd className="mt-1.5 text-sm text-neutral-200">{industry.model}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-500">
                      Cost driver
                    </dt>
                    <dd className="mt-1.5 text-sm text-accent">{industry.driver}</dd>
                  </div>
                </dl>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-7">
                  <h3 className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-500">
                    What goes wrong
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-neutral-400">{industry.problem}</p>
                </div>
                <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-7">
                  <h3 className="text-[0.65rem] uppercase tracking-[0.18em] text-accent">
                    What this does
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-neutral-300">{industry.answer}</p>
                </div>
              </div>
            </div>
          </div>
        </SectionShell>
      ))}

      <SectionShell act="05" label="Hybrid" size="tall">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-8 md:p-12">
            <h2 className="max-w-[24ch] font-display text-display-3 leading-[1.05] text-neutral-100">
              <AnimatedText text="Most real orders are more than one of these" by="word" />
            </h2>
            <p className="mt-6 max-w-[62ch] text-base leading-relaxed text-neutral-400">
              A hi-vis vest certified to EN ISO 20471, screen-printed on the back, embroidered on
              the chest, sold in a size matrix on a staged-delivery contract is a single sellable
              item touching all four archetypes at once.
            </p>
            <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-neutral-400">
              That item is the acceptance test for the whole design. If the system cannot express
              it cleanly, the system is wrong.
            </p>
          </div>
        </div>
      </SectionShell>

      <CtaBand secondaryHref="/platform" secondaryLabel="Explore the platform" />
    </>
  );
}
