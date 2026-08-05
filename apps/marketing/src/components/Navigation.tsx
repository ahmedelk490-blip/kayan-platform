'use client';

import { useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'motion/react';
import { BRAND } from '@erp/brand';
import { EASE } from '@erp/motion';
import { MagneticButton } from '@erp/ui-market';
import { cn } from '@erp/utils';

const LINKS = [
  { href: '#making', label: 'The Making' },
  { href: '#control', label: 'The Control' },
  { href: '#intelligence', label: 'Intelligence' },
];

/**
 * Sticky header — WOW beat: full-bleed bar condensing into a floating pill.
 *
 * The morph is the header's single motion idea, used nowhere else on the page.
 */
export function Navigation() {
  const [condensed, setCondensed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setCondensed(latest > 80);
  });

  return (
    <motion.header
      initial={false}
      animate={{
        paddingTop: condensed ? 12 : 24,
        paddingBottom: condensed ? 12 : 24,
      }}
      transition={{ duration: 0.5, ease: EASE.outExpo }}
      className="fixed inset-x-0 top-0 z-40 px-4 md:px-6"
    >
      <motion.nav
        initial={false}
        animate={{
          maxWidth: condensed ? 880 : 1400,
          backgroundColor: condensed ? 'rgba(12,16,19,0.72)' : 'rgba(12,16,19,0)',
          borderColor: condensed ? 'rgba(33,42,49,1)' : 'rgba(33,42,49,0)',
        }}
        transition={{ duration: 0.5, ease: EASE.outExpo }}
        className={cn(
          'mx-auto flex items-center justify-between gap-6 rounded-full border px-5 py-2.5',
          condensed && 'backdrop-blur-xl',
        )}
      >
        <a
          href="#top"
          className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.18em] text-steel-100"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
          {BRAND.name}
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-steel-400 transition-colors duration-300 hover:text-steel-100"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:block">
          <MagneticButton href="#cta" className="px-5 py-2 text-xs" strength={0.25}>
            Request a demo
          </MagneticButton>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-steel-700 md:hidden"
        >
          <span className="relative block h-3 w-4">
            <motion.span
              animate={{ rotate: menuOpen ? 45 : 0, y: menuOpen ? 5 : 0 }}
              className="absolute inset-x-0 top-0 h-px bg-steel-100"
            />
            <motion.span
              animate={{ opacity: menuOpen ? 0 : 1 }}
              className="absolute inset-x-0 top-1.5 h-px bg-steel-100"
            />
            <motion.span
              animate={{ rotate: menuOpen ? -45 : 0, y: menuOpen ? -5 : 0 }}
              className="absolute inset-x-0 bottom-0 h-px bg-steel-100"
            />
          </span>
        </button>
      </motion.nav>

      <motion.div
        id="mobile-menu"
        initial={false}
        animate={{ height: menuOpen ? 'auto' : 0, opacity: menuOpen ? 1 : 0 }}
        transition={{ duration: 0.4, ease: EASE.outExpo }}
        className="mx-auto mt-2 max-w-[880px] overflow-hidden rounded-3xl border border-steel-700 bg-steel-900/90 backdrop-blur-xl md:hidden"
        aria-hidden={!menuOpen}
      >
        <div className="flex flex-col gap-1 p-4">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              tabIndex={menuOpen ? 0 : -1}
              className="rounded-xl px-4 py-3 text-sm text-steel-300 transition-colors hover:bg-steel-800 hover:text-steel-100"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#cta"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
            className="mt-2 rounded-xl bg-accent px-4 py-3 text-center text-sm font-medium text-steel-950"
          >
            Request a demo
          </a>
        </div>
      </motion.div>
    </motion.header>
  );
}
