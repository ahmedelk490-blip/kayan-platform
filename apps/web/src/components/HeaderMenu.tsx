'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface MenuGroup {
  title: string;
  links: { href: string; label: string }[];
}

/**
 * قائمة التنقّل في ترويسة الهاتف.
 *
 * كان شريطٌ من رقاقات المجموعات يشغل سطراً كاملاً تحت الترويسة، ويزحف أفقياً
 * فتختفي نصف المجموعات خارج الشاشة — يُنفَق ارتفاعٌ دائم على تنقّلٍ يُستعمل
 * مرّةً كل بضع دقائق. صار زرّاً واحداً في الترويسة يفتح كل المجموعات
 * وروابطها مرّةً واحدة: الارتفاع للمحتوى، والتنقّل عند الطلب.
 *
 * على الديسكتوب لا يظهر — هناك الشريط الجانبي الكامل.
 */
export function HeaderMenu({ groups }: { groups: MenuGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // التنقّل يُغلق القائمة: نفس المسار قد يُنقَر مرّتين، والمكوّن لا يُفكّ.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape يغلقها كأي حوار، والخلفية تُقفل التمرير خلفها.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="header-menu"
        aria-label="القائمة"
        className="grid h-9 w-9 place-items-center rounded-lg border border-line text-txt-2 transition-colors hover:border-brand hover:text-brand"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <>
          {/* النقر خارجها يغلقها — بلا مستمعٍ عام على المستند. */}
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 z-40 cursor-default bg-black/30"
          />
          <nav
            id="header-menu"
            aria-label="التنقل الرئيسي"
            className="fixed inset-x-0 top-14 z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-line bg-card px-4 py-3 shadow-[0_12px_24px_rgba(31,20,24,0.12)]"
          >
            {groups.map((g) => (
              <div key={g.title} className="border-b border-line py-2.5 last:border-b-0">
                <p className="mb-1.5 text-[0.7rem] font-medium text-txt-4">{g.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.links.map((l) => {
                    const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                    return (
                      <Link
                        key={l.href}
                        href={l.href}
                        aria-current={active ? 'page' : undefined}
                        className={
                          active
                            ? 'rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white'
                            : 'rounded-lg border border-line-2 px-3 py-2 text-xs text-txt-2'
                        }
                      >
                        {l.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
