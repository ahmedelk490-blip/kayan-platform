'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLink {
  href: string;
  label: string;
}

/**
 * روابط التنقل مع إبراز الصفحة الحالية.
 *
 * A client component purely because the active state needs the current path.
 * The permission filtering happens on the server in AppShell — this receives
 * an already-filtered list and never decides who sees what.
 */
export function SidebarNav({ items }: { items: NavLink[] }) {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'block rounded-lg border-s-[3px] border-s-brand bg-brand-soft px-4 py-2.5 text-sm font-medium text-brand'
                  : 'block rounded-lg border-s-[3px] border-s-transparent px-4 py-2.5 text-sm text-txt-2 transition-colors hover:bg-card-2 hover:text-brand'
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** نفس الروابط بشكل أفقي للموبايل. */
export function MobileNav({ items }: { items: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="flex gap-2 overflow-x-auto border-b border-line bg-card px-5 py-2.5 lg:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'shrink-0 rounded-full bg-brand px-3.5 py-1.5 text-xs font-medium text-white'
                : 'shrink-0 rounded-full border border-line-2 px-3.5 py-1.5 text-xs text-txt-2 transition-colors hover:border-brand hover:text-brand'
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
