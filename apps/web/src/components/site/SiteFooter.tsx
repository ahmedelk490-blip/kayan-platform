import Link from 'next/link';
import { BRAND } from '@erp/brand';
import { Logo } from '@erp/brand/logo';
import { FOOTER_GROUPS } from '@/site';

/**
 * Corporate footer with sitemap.
 *
 * Milestone 2: extended from the oversized-logotype parallax beat to a full
 * sitemap. The logotype reveal is retained — it is the footer's visual idea
 * and the close of the page's vertical rhythm.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-edge px-6 py-16 md:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          <div>
            <Link href="/" aria-label={`${BRAND.nameAr} — الرئيسية`} className="inline-flex">
              <Logo height={56} className="rounded-lg" />
            </Link>
            <p className="mt-5 max-w-[34ch] text-sm leading-loose text-body-muted">
              {BRAND.tagline.ar}
            </p>
            <p className="mt-4 max-w-[34ch] text-sm leading-loose text-body-subtle">
              {BRAND.message.ar}
            </p>
            <p className="mt-5 text-sm text-brand">{BRAND.slogan.ar}</p>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-[0.65rem] uppercase tracking-[0.18em] text-body-subtle">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {/* Keyed by label, not href — several links in a group point
                    at the same section anchor. */}
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-body-muted transition-colors duration-300 hover:text-body"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p
          aria-hidden="true"
          className="mt-20 select-none font-display text-[clamp(3rem,14vw,11rem)] leading-none tracking-tight text-primary-900"
        >
          {BRAND.name}
        </p>

        <div className="mt-8 flex flex-col gap-4 border-t border-edge pt-8 text-xs text-body-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>
            {BRAND.nameAr} | {BRAND.name} — مصنع الزي الموحد والطباعة والتطريز
          </span>
          <span>© {new Date().getFullYear()} · جميع الحقوق محفوظة</span>
        </div>
      </div>
    </footer>
  );
}
