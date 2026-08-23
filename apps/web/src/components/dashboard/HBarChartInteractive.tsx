'use client';

import { useState } from 'react';
import type { ChartPoint } from './BarChartInteractive';

/**
 * أعمدة أفقية تفاعلية — لقوائم مثل «أفضل المنتجات».
 *
 * كل صف: الاسم، شريط بطوله نسبةً لأكبر قيمة، والقيمة. المرور يبرز الصف.
 * div/CSS فقط، بلا مكتبة، ليبقى البناء خفيفاً.
 */
export function HBarChartInteractive({ points }: { points: ChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <ul className="space-y-2.5">
      {points.map((p, i) => {
        const pct = Math.max((p.value / max) * 100, 2);
        const on = active === i;
        return (
          <li
            key={i}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className="grid grid-cols-[9rem_1fr_auto] items-center gap-3"
          >
            <span className={`truncate text-xs ${on ? 'text-brand' : 'text-txt-2'}`} dir="auto" title={p.label}>
              {p.label}
            </span>
            <span className="h-3 overflow-hidden rounded-full bg-card-2">
              <span
                className={`block h-full rounded-full transition-[width,background-color] duration-200 ${on ? 'bg-brand' : 'bg-brand/55'}`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="tnum text-end text-xs font-medium text-txt">{p.display ?? p.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
