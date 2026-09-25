/**
 * علامة دائرية — نسبة جزء إلى كلّ.
 *
 * SVG خالص بلا مكتبة: سياسة أمان المحتوى تمنع أي سكربت خارجي، ورسم حلقة
 * لا يحتاج أكثر من قوسين. القوس المملوء يُرسم بـ stroke-dasharray على محيط
 * الدائرة — الطول المرئي = المحيط × النسبة.
 *
 * قيمة أو حدّ صفر تعرض حلقة فارغة ونصّاً «—»، لا NaN ولا قسمة على صفر.
 */
const TONES: Record<string, string> = {
  brand: 'var(--color-brand)',
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  bad: 'var(--color-bad)',
};

export function Donut({
  value,
  max,
  label,
  center,
  sub,
  tone = 'brand',
}: {
  value: number;
  max: number;
  label: string;
  /** النص في وسط الحلقة؛ افتراضياً النسبة المئوية. */
  center?: string;
  sub?: string;
  tone?: 'brand' | 'ok' | 'warn' | 'bad';
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const R = 42;
  const C = 2 * Math.PI * R;
  const dash = C * pct;
  const color = TONES[tone] ?? TONES.brand;
  const centerText = center ?? (max > 0 ? `${Math.round(pct * 100)}%` : '—');

  // على الهاتف سطرٌ لا بطاقة: ثلاث دوائر بقطر ١١٢ بكسل واحدةً تحت الأخرى
  // تملأ الشاشة بثلاثة أرقام. حلقةٌ صغيرة يميناً والنصّ بجانبها تُقرأ بلمحة
  // وتترك المكان لما تحتها. وعلى الديسكتوب تبقى ثلاثاً جنباً إلى جنب كما هي.
  return (
    <div className="flex items-center gap-3 text-start sm:flex-col sm:gap-2 sm:text-center">
      <div className="relative h-14 w-14 shrink-0 sm:h-28 sm:w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line)" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-semibold text-txt sm:text-lg">{centerText}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-txt-2">{label}</p>
        {sub && <p className="mt-0.5 text-[0.7rem] leading-snug text-txt-4">{sub}</p>}
      </div>
    </div>
  );
}
