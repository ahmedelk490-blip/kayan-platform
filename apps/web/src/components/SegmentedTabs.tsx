'use client';

import { useState, type ReactNode } from 'react';

/**
 * تبويبات داخلية للشاشة الواحدة — مبدّل عرض لا تنقّل بين صفحات.
 *
 * الشاشة تحمل بيانات كثيرة (أرصدة، خامات، حركات) فيطول تمريرها. هذه تعرض
 * قسماً واحداً في كل مرة بشكل شريط أقراص، فيرى المستخدم كل شيء «من فوق» بلا
 * أن ينزل. شكلها (أقراص) يختلف عن تبويبات المنطقة (شريط سفلي) فلا يختلط
 * تبديل العرض بالتنقّل بين الشاشات.
 *
 * كل الأقسام تُصيَّر من الخادم وتبقى في DOM؛ التبديل يُظهر واحداً ويخفي
 * الباقي، فلا إعادة جلب ولا وميض.
 */
export function SegmentedTabs({
  tabs,
  defaultKey,
}: {
  tabs: { key: string; label: string; badge?: number; content: ReactNode }[];
  /** التبويب المفتوح ابتداءً — يُمرَّر من ?tab= ليقفز رابطٌ خارجي لقسمٍ بعينه. */
  defaultKey?: string;
}) {
  const [active, setActive] = useState(
    defaultKey && tabs.some((t) => t.key === defaultKey) ? defaultKey : tabs[0]?.key,
  );

  return (
    <div>
      <div className="mb-5 inline-flex flex-wrap gap-1 rounded-xl border border-line bg-card-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            aria-pressed={active === t.key}
            className={
              active === t.key
                ? 'inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white'
                : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-txt-2 transition-colors hover:text-brand'
            }
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.65rem] ${
                  active === t.key ? 'bg-white/25 text-white' : 'bg-bad text-white'
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div key={t.key} hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
