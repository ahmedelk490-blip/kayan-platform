'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useMotionValueEvent, useScroll } from 'motion/react';
import { BRAND } from '@erp/brand';
import { Logo } from '@erp/brand/logo';
import { EASE } from '@erp/motion';
import { MagneticButton } from '@erp/ui-market';
import { cn } from '@erp/utils';
import { NAV_LINKS } from '@/site';

/**
 * Sticky header — full-bleed bar condensing into a floating pill.
 *
 * Milestone 2: extended from homepage anchors to real routes with active
 * state. The morph itself is unchanged — it was production quality and is
 * the header's single motion idea, used nowhere else on the site.
 */
export function Navigation() {
  const [condensed, setCondensed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY } = useScroll();
  const pathname = usePathname();

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setCondensed(latest > 80);
  });

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <motion.header
      initial={false}
      animate={{ paddingTop: condensed ? 12 : 24, paddingBottom: condensed ? 12 : 24 }}
      transition={{ duration: 0.5, ease: EASE.outExpo }}
      className="fixed inset-x-0 top-0 z-40 px-4 md:px-6"
    >
      <motion.nav
        initial={false}
        animate={{
          maxWidth: condensed ? 880 : 1400,
          backgroundColor: condensed ? 'rgba(28,18,22,0.78)' : 'rgba(28,18,22,0)',
          borderColor: condensed ? 'rgba(45,31,36,1)' : 'rgba(45,31,36,0)',
        }}
        transition={{ duration: 0.5, ease: EASE.outExpo }}
        className={cn(
          'mx-auto flex items-center justify-between gap-6 rounded-full border px-5 py-2.5',
          condensed && 'backdrop-blur-xl',
        )}
      >
        <Link href="/" aria-label={`${BRAND.name} — home`} className="flex items-center">
          <Logo height={34} className="rounded-md" />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cn(
                'relative text-sm transition-colors duration-300 hover:text-neutral-100',
                isActive(link.href) ? 'text-neutral-100' : 'text-neutral-400',
              )}
            >
              {link.label}
              {isActive(link.href) && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute -bottom-1.5 left-0 h-px w-full bg-accent"
                />
              )}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-full border border-ink-700 px-4 py-2 text-xs text-neutral-300 transition-colors hover:border-accent hover:text-accent"
          >
            دخول النظام
          </Link>
          {/* #quote, not #contact — the contact section was replaced by the
              quote form in Phase 8, and this button pointed at an anchor that
              no longer existed, so it silently did nothing. */}
          <MagneticButton href="#quote" className="px-5 py-2 text-xs" strength={0.25}>
            اطلب عرض سعر
          </MagneticButton>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-700 md:hidden"
        >
          <span className="relative block h-3 w-4">
            <motion.span
              animate={{ rotate: menuOpen ? 45 : 0, y: menuOpen ? 5 : 0 }}
              className="absolute inset-x-0 top-0 h-px bg-neutral-100"
            />
            <motion.span
              animate={{ opacity: menuOpen ? 0 : 1 }}
              className="absolute inset-x-0 top-1.5 h-px bg-neutral-100"
            />
            <motion.span
              animate={{ rotate: menuOpen ? -45 : 0, y: menuOpen ? -5 : 0 }}
              className="absolute inset-x-0 bottom-0 h-px bg-neutral-100"
            />
          </span>
        </button>
      </motion.nav>

      <motion.div
        id="mobile-menu"
        initial={false}
        animate={{ height: menuOpen ? 'auto' : 0, opacity: menuOpen ? 1 : 0 }}
        transition={{ duration: 0.4, ease: EASE.outExpo }}
        className="mx-auto mt-2 max-w-[880px] overflow-hidden rounded-3xl border border-ink-700 bg-ink-900/90 backdrop-blur-xl md:hidden"
        aria-hidden={!menuOpen}
      >
        <div className="flex flex-col gap-1 p-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              tabIndex={menuOpen ? 0 : -1}
              className={cn(
                'rounded-xl px-4 py-3 text-sm transition-colors hover:bg-ink-800 hover:text-neutral-100',
                isActive(link.href) ? 'text-accent' : 'text-neutral-300',
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
            className="mt-2 rounded-xl border border-ink-700 px-4 py-3 text-center text-sm text-neutral-200"
          >
            دخول النظام
          </Link>
          <Link
            href="#quote"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
            className="rounded-xl bg-primary-600 px-4 py-3 text-center text-sm font-medium text-neutral-50"
          >
            اطلب عرض سعر
          </Link>
        </div>
      </motion.div>
    </motion.header>
  );
}
