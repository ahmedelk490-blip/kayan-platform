import type { ReactNode } from 'react';
import { SectionShell } from '@erp/ui-market';

/**
 * Typographic shell for legal pages. Measure capped for readability; no
 * motion, because nobody wants a policy to animate at them.
 */
export function LegalBody({ children }: { children: ReactNode }) {
  return (
    <SectionShell size="base">
      <div
        className={[
          'mx-auto w-full max-w-[68ch]',
          // توكنات لا درجات ثابتة — العناوين كانت شبه بيضاء فتختفي في الفاتح.
          '[&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-body',
          '[&_p]:mt-4 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-body-muted',
        ].join(' ')}
      >
        {children}
      </div>
    </SectionShell>
  );
}

/**
 * Honest status marker.
 *
 * These pages describe what the site actually does, but they have not been
 * reviewed by a lawyer and the operating company's legal identity is not yet
 * known. Presenting them as finished legal text would be a fabrication, so
 * they say so instead.
 */
export function LegalNotice() {
  return (
    <p className="rounded-xl border border-border bg-surface-raised p-5 text-xs leading-relaxed text-body-muted">
      <strong className="text-body">Draft — pending legal review.</strong> This page
      describes current practice accurately, but it has not been reviewed by a qualified lawyer
      and does not yet name the operating legal entity. It must be reviewed and completed before
      this site handles real enquiries.
    </p>
  );
}
