import type { Metadata } from 'next';
import { PageHero } from '@/components/PageHero';
import { LegalBody, LegalNotice } from '@/components/LegalBody';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms governing use of this website.',
};

export default function TermsPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Terms."
        lead="Terms governing your use of this website. Software licensing is covered by a separate agreement."
      />
      <LegalBody>
        <LegalNotice />

        <h2>Scope</h2>
        <p>
          These terms cover this website only. Use of the ERP platform itself is governed by a
          separate written agreement between us and the licensing company.
        </p>

        <h2>Accuracy</h2>
        <p>
          We describe the platform as accurately as we can, including which capabilities are
          built and which are planned. Descriptions of planned functionality are statements of
          intent, not commitments, and do not form part of any contract.
        </p>

        <h2>Figures shown on this site</h2>
        <p>
          Costing examples, including the cost sheet shown on the platform page, are worked
          illustrations using representative figures. They demonstrate how the calculation is
          structured and traced. They are not a quotation and not a performance guarantee.
        </p>

        <h2>Intellectual property</h2>
        <p>
          The content, design, and code of this site belong to us. Standards referenced on this
          site, such as EN ISO 20471, belong to their respective bodies.
        </p>

        <h2>Availability</h2>
        <p>
          We aim to keep the site available but do not guarantee uninterrupted access, and may
          change or withdraw content at any time.
        </p>
      </LegalBody>
    </>
  );
}
