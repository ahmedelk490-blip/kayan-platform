'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavGroup {
  title: string;
  /** الوجهة عند الضغط — الصفحة الرئيسية للمجموعة. */
  primary: string;
  /** كل مسارات المجموعة، لإبراز المجموعة النشطة. */
  hrefs: string[];
}

/**
 * تنقّل بمستوى المجموعات — عنصر واحد لكل مجموعة.
 *
 * كان الشريط الجانبي يعرض كل صفحات المجموعة، فتظهر عروض الأسعار وأوامر
 * البيع في الجنب وتتكرّر كتبويبات أعلى المحتوى. الآن المجموعة عنصرٌ واحد
 * (المبيعات، المخزون…) يفتح لوحتها، والتنقّل بين صفحاتها من التبويبات
 * الداخلية وحدها — تابٌ واحد لكل مجموعة، لا رأسٌ متكرّر.
 */
export function GroupNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {groups.map((g) => {
        const active = g.hrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`));
        return (
          <li key={g.primary}>
            <Link
              href={g.primary}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'block rounded-lg border-s-[3px] border-s-brand bg-brand-soft px-4 py-2.5 text-sm font-medium text-brand'
                  : 'block rounded-lg border-s-[3px] border-s-transparent px-4 py-2.5 text-sm text-txt-2 transition-colors hover:bg-card-2 hover:text-brand'
              }
            >
              {g.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
