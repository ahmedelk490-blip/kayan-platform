import type { Metadata } from 'next';
import { PageHero } from '@/components/PageHero';
import { LegalBody, LegalNotice } from '@/components/LegalBody';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What this site collects, why, and how long it is kept.',
};

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Privacy."
        lead="A factual description of what this website collects and what happens to it."
      />
      <LegalBody>
        <LegalNotice />

        <h2>What we collect</h2>
        <p>
          Only what you type into the demo request form: your name, company, work email, and
          optionally your phone number, the product types you selected, and your message.
        </p>
        <p>
          This site sets no advertising cookies, runs no third-party analytics, and does not
          track you across other websites. Fonts are served from this site rather than a third
          party, so loading a page does not disclose your visit to anyone else.
        </p>

        <h2>Why we collect it</h2>
        <p>
          To reply to your enquiry and to prepare a demonstration. We do not sell it, share it
          with third parties for their own purposes, or add you to a marketing sequence.
        </p>

        <h2>How long we keep it</h2>
        <p>
          For as long as we are in contact about your enquiry, and for a reasonable period
          afterwards for our records. Ask us to delete it and we will.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask what we hold about you, ask for it to be corrected, or ask for it to be
          deleted. Contact us using the details on the demo request page and we will action it.
        </p>

        <h2>Security</h2>
        <p>
          Submissions are transmitted over an encrypted connection. Access is limited to the
          people handling your enquiry.
        </p>
      </LegalBody>
    </>
  );
}
