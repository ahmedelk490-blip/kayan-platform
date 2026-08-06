import type { Metadata } from 'next';
import { SectionShell, AnimatedText, CountingNumber } from '@erp/ui-market';
import { PageHero } from '@/components/PageHero';
import { CtaBand } from '@/components/CtaBand';

export const metadata: Metadata = {
  title: 'Company — how we build',
  description:
    'A specialised ERP for printing, embroidery, uniforms and safety products. Documentation precedes code; the ledger is never a guess.',
};

const PRINCIPLES = [
  {
    n: '01',
    title: 'Correctness beats convenience in finance',
    body: 'The ledger never updates and never deletes. Corrections are reversals. This costs us convenience and buys you a trial balance you can trust without checking.',
  },
  {
    n: '02',
    title: 'Every number explains itself',
    body: 'Any figure traces to its inputs and the formula version that produced it. A total nobody can defend is not a total; it is a guess with a decimal point.',
  },
  {
    n: '03',
    title: 'Configuration over customisation',
    body: 'Tax rules, production formulas, valuation method and the chart of accounts are data. Adding a jurisdiction should not require a release.',
  },
  {
    n: '04',
    title: 'Arabic is not a translation layer',
    body: 'Right-to-left is an architectural constraint applied from the first commit. Retrofitting it after a component library hardens around left-to-right is the expensive way to do it.',
  },
  {
    n: '05',
    title: 'Gaps are stated',
    body: 'An unimplemented capability says so. Silence reads as coverage, and coverage you assumed is the most expensive kind to discover late.',
  },
  {
    n: '06',
    title: 'Documentation precedes code',
    body: 'No module is implemented before its documentation is updated. Ten governed documents are the single source of truth, and they are written to be argued with.',
  },
];

const FIGURES = [
  { value: 219, label: 'Requirements specified before implementation began' },
  { value: 130, label: 'Tables designed across fifteen domains' },
  { value: 16, label: 'Constitutional articles every decision is checked against' },
  { value: 10, label: 'Governed documents kept current, always' },
];

export default function CompanyPage() {
  return (
    <>
      <PageHero
        eyebrow="Company"
        title="We build the boring parts properly."
        lead="Specialised software for companies that print, embroider, manufacture uniforms and distribute safety equipment — often on the same order. Depth in four verticals, rather than breadth across forty."
      />

      <SectionShell act="01" label="The approach" size="tall">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <h2 className="font-display text-display-3 leading-[1.05] text-neutral-100">
              <AnimatedText text="Design first. Then build. Never the reverse." by="word" />
            </h2>
            <div className="space-y-5 text-base leading-relaxed text-neutral-400">
              <p>
                Most ERP projects fail in the same place: someone builds screens before deciding
                how the ledger works, and by the time the accounting is wrong there is a year of
                code sitting on top of it.
              </p>
              <p>
                So this one started with a specification, an architecture, and a database design
                — argued through, corrected, and signed off before the first component existed.
                Finance and inventory are built before anything visible, because retrofitting a
                ledger beneath a live system is a rewrite rather than a refactor.
              </p>
              <p>
                It is a slower start. It is the only version of this that finishes.
              </p>
            </div>
          </div>

          <dl className="mt-20 grid gap-x-8 gap-y-12 border-t border-ink-800 pt-14 sm:grid-cols-2 lg:grid-cols-4">
            {FIGURES.map((figure) => (
              <div key={figure.label}>
                <dd className="font-display text-display-3 leading-none text-neutral-100">
                  <CountingNumber value={figure.value} />
                </dd>
                <dt className="mt-4 max-w-[26ch] text-sm leading-relaxed text-neutral-400">
                  {figure.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </SectionShell>

      <SectionShell id="principles" act="02" label="Principles" size="tall" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-[1400px]">
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 md:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <li key={principle.n} className="bg-ink-950 p-8">
                <span className="font-display text-3xl text-ink-700">{principle.n}</span>
                <h3 className="mt-5 font-display text-lg leading-snug text-neutral-100">
                  {principle.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">{principle.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </SectionShell>

      <CtaBand
        title="Bring us a job we should not be able to cost."
        secondaryHref="/platform"
        secondaryLabel="Explore the platform"
      />
    </>
  );
}
