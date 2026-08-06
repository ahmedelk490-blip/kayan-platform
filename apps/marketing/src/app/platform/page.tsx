import type { Metadata } from 'next';
import { SectionShell, AnimatedText } from '@erp/ui-market';
import { PageHero } from '@/components/PageHero';
import { CtaBand } from '@/components/CtaBand';
import { CostSheetPreview } from '@/components/CostSheetPreview';

export const metadata: Metadata = {
  title: 'Platform — one system for makers',
  description:
    'Eighteen modules over one ledger: costing, inventory with cost layers, manufacturing, CRM, finance and a configurable tax engine.',
};

const MODULES = [
  { name: 'Cost engine', body: 'Six costing strategies, one per product archetype. Every figure carries its derivation.' },
  { name: 'Inventory', body: 'Cost layers as the storage of record. Weighted average, FIFO or specific cost, per company.' },
  { name: 'Manufacturing', body: 'Multi-level BOMs with size- and colour-dependent consumption, routings and shop-floor capture.' },
  { name: 'CRM & sales', body: 'Quote built on the cost engine, staged delivery, per-employee size rosters, artwork approval.' },
  { name: 'Finance', body: 'Double-entry, append-only. Corrections by reversal. Trial balance that is never a reconciliation.' },
  { name: 'Tax engine', body: 'No jurisdiction compiled in. Rules are configuration; e-invoicing arrives as a plugin.' },
  { name: 'Purchasing', body: 'Requisition to three-way match, with landed cost allocated into the receiving layer.' },
  { name: 'Formula engine', body: 'Admin-editable formulas, parsed to an AST, versioned and approved. Never eval.' },
  { name: 'Reporting', body: 'Every KPI drills through to the transactions underneath it. Arabic and English, including PDF.' },
];

const PRINCIPLES = [
  { k: 'Postings', v: 'Append-only' },
  { k: 'Corrections', v: 'By reversal' },
  { k: 'Money', v: 'Exact decimal' },
  { k: 'Isolation', v: 'Enforced in the database' },
];

export default function PlatformPage() {
  return (
    <>
      <PageHero
        eyebrow="The platform"
        title="Eighteen modules. One ledger."
        lead="Most ERPs treat printing, embroidery, uniforms and safety equipment as four rows in one product table. They are four manufacturing archetypes with incompatible costing models, and this system models each one natively."
        meta={[
          { label: 'Modules', value: '18' },
          { label: 'Archetypes', value: '6 incl. hybrid' },
          { label: 'Deployment', value: 'Cloud or on-premise' },
          { label: 'Languages', value: 'Arabic · English' },
        ]}
      />

      <SectionShell id="costing" act="01" label="The cost engine" size="tall">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div>
              <h2 className="max-w-[20ch] font-display text-display-3 leading-[1.05] text-neutral-100">
                <AnimatedText text="Every cost explains where it came from" by="word" />
              </h2>
              <p className="mt-6 max-w-[46ch] text-base leading-relaxed text-neutral-400">
                A total is not an answer. Each calculation writes an immutable derivation tree —
                the formula version that ran, the inputs it used, and the source of every input.
              </p>
              <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-neutral-400">
                Because the tree stores resolved values rather than links to live records,
                editing a price or a formula tomorrow cannot change a quotation issued today.
              </p>

              <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-ink-800 pt-8">
                {PRINCIPLES.map((item) => (
                  <div key={item.k}>
                    <dt className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-500">
                      {item.k}
                    </dt>
                    <dd className="mt-1.5 font-display text-sm text-neutral-200">{item.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div id="preview" className="scroll-mt-28">
              <CostSheetPreview />
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="modules" act="02" label="The modules" size="tall">
        <div className="mx-auto w-full max-w-[1400px]">
          <h2 className="mb-14 max-w-[22ch] font-display text-display-3 leading-[1.05] text-neutral-100">
            <AnimatedText text="Built in dependency order, not demo order" by="word" />
          </h2>

          <ul className="grid gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((module) => (
              <li key={module.name} className="bg-ink-950 p-7 transition-colors hover:bg-ink-900">
                <h3 className="font-display text-lg text-neutral-100">{module.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">{module.body}</p>
              </li>
            ))}
          </ul>

          <p className="mt-8 max-w-[64ch] text-sm leading-relaxed text-neutral-500">
            Finance and inventory are built before anything visible. Retrofitting a ledger
            beneath a live system is a rewrite, not a refactor.
          </p>
        </div>
      </SectionShell>

      <CtaBand secondaryHref="/industries" secondaryLabel="See your industry" />
    </>
  );
}
