import type { Metadata } from 'next';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/PageHero';
import { LeadForm } from '@/components/LeadForm';

export const metadata: Metadata = {
  title: 'Request a demo',
  description:
    'Bring a real quotation and we will cost it in the system, showing every number it used.',
};

const EXPECT = [
  {
    n: '01',
    title: 'You bring a real job',
    body: 'A print run, an embroidery order, a uniform contract. Ideally one you already priced, so you have something to compare against.',
  },
  {
    n: '02',
    title: 'We cost it live',
    body: 'Set up as a hybrid item if it needs to be, with your fabric, your stitch count and your waste percentages.',
  },
  {
    n: '03',
    title: 'You interrogate the number',
    body: 'Expand any figure down to the formula version and the source of every input. If it disagrees with your spreadsheet, we find out why together.',
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Request a demo"
        title="Bring a job we should not be able to cost."
        lead="The fastest way to judge this system is to point it at work you already priced, and see whether it agrees with you — and whether it can show its reasoning when it does not."
      />

      <SectionShell size="tall">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
            <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-7 md:p-10">
              <LeadForm />
            </div>

            <div>
              <h2 className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-500">
                What to expect
              </h2>
              <ol className="mt-8 space-y-9">
                {EXPECT.map((step) => (
                  <li key={step.n} className="flex gap-5">
                    <span className="font-display text-2xl leading-none text-ink-700">
                      {step.n}
                    </span>
                    <div>
                      <h3 className="font-display text-base text-neutral-100">{step.title}</h3>
                      <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-neutral-400">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="rule-hairline my-10" />

              <p className="max-w-[40ch] text-sm leading-relaxed text-neutral-500">
                Deployment is your choice — multi-tenant cloud or dedicated on-premise, from one
                codebase. Arabic and English are both first-class, including right-to-left
                documents.
              </p>
            </div>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
