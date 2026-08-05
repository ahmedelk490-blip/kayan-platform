import { BRAND } from '@erp/brand';

export function SiteFooter() {
  return (
    <footer className="border-t border-steel-800 px-6 py-16 md:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-[1400px]">
        <p
          aria-hidden="true"
          className="font-display text-[clamp(3rem,14vw,11rem)] leading-none tracking-tight text-steel-900 select-none"
        >
          {BRAND.name}
        </p>

        <div className="mt-10 flex flex-col gap-4 border-t border-steel-800 pt-8 text-xs text-steel-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {BRAND.name} — {BRAND.tagline.en}
          </span>
          <span>© {new Date().getFullYear()} · All rights reserved</span>
        </div>
      </div>
    </footer>
  );
}
