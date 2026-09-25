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
