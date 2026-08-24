'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface Alert {
  id: string;
  label: string;
  detail: string;
  href: string;
}

/**
 * جرس تنبيهات في الترويسة — ينبّه على نقص المخزون والمستلزمات (الأحبار
 * والرولات وغيرها) قبل أن تخلص. العدد الأحمر يلفت النظر، والقائمة تفتح عند
 * الضغط. بيانات حقيقية تُمرَّر من الخادم.
 */
export function NotificationBell({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  const count = alerts.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-txt-3 transition-colors hover:bg-card-2 hover:text-brand"
        aria-label={`تنبيهات (${count})`}
        title="تنبيهات المخزون"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[0.6rem] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-30 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-line bg-card shadow-xl">
          <div className="border-b border-line px-4 py-2.5 text-xs font-semibold text-brand">
            تنبيهات المخزون {count > 0 && `(${count})`}
          </div>
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-txt-3">لا تنبيهات — كل الأرصدة فوق حدّها.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-line">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="block px-4 py-2.5 transition-colors hover:bg-card-2">
                    <span className="flex items-start gap-2">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warn" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-txt" dir="auto">{a.label}</span>
                        <span className="block text-[0.7rem] text-txt-3">{a.detail}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
