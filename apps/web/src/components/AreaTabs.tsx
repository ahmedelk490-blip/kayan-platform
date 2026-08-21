'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface AreaGroup {
  title: string;
  links: { href: string; label: string }[];
}

/**
 * شريط تبويبات للمنطقة الحالية.
 *
 * الشريط الجانبي يجمع الروابط في مجموعات؛ هذا يعرض روابط المجموعة التي
 * تخصّها الصفحة المفتوحة كتبويبات أفقية أعلى المحتوى. فالمندوب داخل
 * المبيعات يتنقّل بين العروض والأوامر والفواتير بتبويب واحد بلا عودة
 * للشريط الجانبي، والدنيا لا تتلخبط.
 *
 * المجموعة تُختار بالمطابقة: التبويب النشط هو أطول مساره الذي يبدأ به
 * المسار الحالي، فصفحة فرعية مثل /sales/orders/123 تُبرز «أوامر البيع» لا
 * «لوحة المبيعات». مجموعة بتبويب واحد لا تُعرض — لا معنى لشريط تبويب واحد.
 */
export function AreaTabs({ groups }: { groups: AreaGroup[] }) {
  const pathname = usePathname();

  // المجموعة التي تحوي رابطاً يطابق المسار الحالي.
  const active = groups.find((g) =>
    g.links.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`)),
  );
  if (!active || active.links.length < 2) return null;

  // التبويب النشط: أطول href يبدأ به المسار — فالأخصّ يفوز على الأعمّ.
  let activeHref = '';
  for (const l of active.links) {
    if ((pathname === l.href || pathname.startsWith(`${l.href}/`)) && l.href.length > activeHref.length) {
      activeHref = l.href;
    }
  }

  return (
    <div className="border-b border-line bg-card px-5 lg:px-8">
      <nav
        aria-label={active.title}
        className="-mb-px flex gap-1 overflow-x-auto"
      >
        {active.links.map((l) => {
          const isActive = l.href === activeHref;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'shrink-0 border-b-2 border-brand px-4 py-3 text-sm font-medium text-brand'
                  : 'shrink-0 border-b-2 border-transparent px-4 py-3 text-sm text-txt-3 transition-colors hover:text-brand'
              }
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
