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
    <footer className="border-t border-ink-800 px-6 py-16 md:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          <div>
            <Link href="/" aria-label={`${BRAND.name} — home`} className="inline-flex">
              <Logo height={56} className="rounded-lg" />
            </Link>
            <p className="mt-5 max-w-[32ch] text-sm leading-relaxed text-neutral-400">
              {BRAND.tagline.en}
            </p>
            <p dir="rtl" className="mt-2 max-w-[32ch] font-arabic text-sm leading-relaxed text-neutral-500">
              {BRAND.tagline.ar}
            </p>
            <p className="mt-5 text-sm text-accent">{BRAND.slogan.en}</p>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-500">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-neutral-400 transition-colors duration-300 hover:text-neutral-100"
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

        <div className="mt-8 flex flex-col gap-4 border-t border-ink-800 pt-8 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {BRAND.name} — {BRAND.tagline.en}
          </span>
          <span>© {new Date().getFullYear()} · All rights reserved</span>
        </div>
      </div>
    </footer>
  );
}
