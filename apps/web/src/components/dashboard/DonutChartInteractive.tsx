'use client';

import { useState } from 'react';
import type { ChartPoint } from './BarChartInteractive';

const PALETTE = ['#2f6bff', '#e5484d', '#30a46c', '#f0b429', '#8e5cff', '#e93d82', '#f76b15', '#12a5b0', '#6e7681', '#0ea5e9'];

/**
 * دائرة (Donut) تفاعلية خفيفة (SVG) — لتوزيع مثل المصروفات حسب البند.
 *
 * المرور على أي قطاع يبرزه ويُظهر تلميحاً بقيمته ونسبته. مع مفتاح ألوان.
 * بلا مكتبة خارجية.
 */
export function DonutChartInteractive({ points }: { points: ChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = points.reduce((s, p) => s + Math.max(p.value, 0), 0);
  if (total <= 0) return <p className="py-8 text-center text-sm text-txt-3">لا بيانات لعرضها.</p>;

  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = points.map((p, i) => {
    const frac = Math.max(p.value, 0) / total;
    const seg = { i, p, frac, dash: frac * c, offset: offset * c, color: PALETTE[i % PALETTE.length] };
    offset += frac;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <svg viewBox="0 0 160 160" className="h-44 w-44 shrink-0 -rotate-90">
        {segs.map((s) => (
          <circle
            key={s.i}
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={active === s.i ? 26 : 20}
            strokeDasharray={`${s.dash} ${c - s.dash}`}
            strokeDashoffset={-s.offset}
            onMouseEnter={() => setActive(s.i)}
            onMouseLeave={() => setActive(null)}
            style={{ cursor: 'pointer', transition: 'stroke-width 0.15s' }}
          />
        ))}
      </svg>
      <ul className="flex-1 space-y-1.5">
        {segs.map((s) => (
          <li
            key={s.i}
            onMouseEnter={() => setActive(s.i)}
            onMouseLeave={() => setActive(null)}
            className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs ${active === s.i ? 'bg-card-2' : ''}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="truncate text-txt-2" dir="auto">{s.p.label}</span>
            </span>
            <span className="tnum shrink-0 text-txt">
              {s.p.display ?? s.p.value} <span className="text-txt-4">({(s.frac * 100).toFixed(0)}٪)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
