'use client';

import { AnimatedText, MagneticButton, SectionShell } from '@erp/ui-market';

interface CtaBandProps {
  title?: string;
  body?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

/**
 * Closing conversion band, shared by every inner page.
 *
 * Calm by design — a visitor ready to convert should not be competing with
 * motion for attention (07_UI_UX §4.5).
 */
export function CtaBand({
  title = 'See it costed on your own job.',
  body = 'Bring a real quotation — a print run, an embroidery order, a uniform contract. We will cost it in the system and show you every number it used.',
  primaryHref = '/contact',
  primaryLabel = 'Request a demo',
  secondaryHref = '/platform',
  secondaryLabel = 'Explore the platform',
}: CtaBandProps) {
  return (
    <SectionShell size="tall">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="rule-hairline mb-16" />
        <div className="flex flex-col items-start gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="max-w-[18ch] font-display text-display-2 leading-[0.98] text-neutral-100">
              <AnimatedText text={title} by="word" />
            </h2>
            <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-neutral-400">{body}</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <MagneticButton href={primaryHref}>{primaryLabel}</MagneticButton>
            <MagneticButton href={secondaryHref} variant="outline">
              {secondaryLabel}
            </MagneticButton>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
