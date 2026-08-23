'use client';

import { useState } from 'react';

export interface ChartPoint {
  label: string;
  value: number;
  /** نص التلميح الجاهز (مثلاً مبلغ منسّق)؛ وإلا يُعرض الرقم. */
  display?: string;
}

/**
 * رسم أعمدة تفاعلي خفيف — بلا مكتبة خارجية.
 *
 * المرور على أي عمود يبرزه ويُظهر تلميحاً بقيمته. مبني على div/CSS فقط
 * ليبقى الحزمة صغيرة والبناء سريعاً على الاستضافة المحدودة الموارد.
 * الأشهر الفارغة تظهر بعمود ضئيل لا صفر مخفيّ — الفجوة تُرى.
 */
export function BarChartInteractive({ points }: { points: ChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div>
      <div className="flex h-52 items-end gap-1.5">
        {points.map((p, i) => {
          const pct = Math.max((p.value / max) * 100, p.value > 0 ? 4 : 1.5);
          const on = active === i;
          return (
            <button
              type="button"
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group relative flex h-full flex-1 cursor-default flex-col items-center justify-end"
              aria-label={`${p.label}: ${p.display ?? p.value}`}
            >
              {on && (
                <span className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg bg-brand px-2.5 py-1 text-[0.7rem] font-medium text-white shadow-lg">
                  {p.label} · {p.display ?? p.value}
                </span>
              )}
              <span
                className={`w-full rounded-t-md transition-[height,background-color] duration-200 ${
                  on ? 'bg-brand' : 'bg-brand/50'
                }`}
                style={{ height: `${pct}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {points.map((p, i) => (
          <span key={i} className={`flex-1 text-center text-[0.62rem] ${active === i ? 'text-brand' : 'text-txt-4'}`}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
