'use client';

import { useState } from 'react';
import type { ChartPoint } from './BarChartInteractive';

/**
 * خط بياني تفاعلي خفيف (SVG) — للتدفق النقدي التراكمي.
 *
 * المرور على أي نقطة يبرزها ويُظهر تلميحاً بقيمتها. يتعامل مع القيم السالبة
 * (رصيد تراكمي قد ينزل تحت الصفر) بمدى ديناميكي. بلا مكتبة خارجية.
 */
export function LineChartInteractive({ points }: { points: ChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return null;

  const W = 640;
  const H = 220;
  const padX = 8;
  const padY = 16;
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const n = points.length;

  const x = (i: number) => padX + (n === 1 ? (W - 2 * padX) / 2 : (i * (W - 2 * padX)) / (n - 1));
  const y = (v: number) => padY + (H - 2 * padY) * (1 - (v - min) / span);
  const zeroY = y(0);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${x(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  return (
    <div>
      <div className="relative">
        {active !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-brand px-2.5 py-1 text-[0.7rem] font-medium text-white shadow-lg"
            style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(points[active].value) / H) * 100}%` }}
          >
            {points[active].label} · {points[active].display ?? points[active].value}
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 220 }}>
          <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="4 4" />
          <path d={areaPath} fill="var(--color-brand)" opacity="0.1" />
          <path d={linePath} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r={active === i ? 6 : 4}
              fill="var(--color-brand)"
              stroke="var(--color-card)"
              strokeWidth="2"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>
      </div>
      <div className="mt-1 flex justify-between">
        {points.map((p, i) => (
          <span key={i} className={`flex-1 text-center text-[0.6rem] ${active === i ? 'text-brand' : 'text-txt-4'}`}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
