import { periodRange, isPeriod, iraqMidnight, IRAQ_OFFSET_MS, type Period } from '@erp/domain';
import type { SearchParams } from '@/lib/query';

export interface ResolvedRange {
  from: Date;
  to: Date;
  /** الفترة الجاهزة المختارة، أو null حين المدى مخصّص بتاريخين. */
  period: Period | null;
  fromStr: string;
  toStr: string;
}

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

// التاريخ المعروض بيوم بغداد: الحدود نقاط UTC مُزاحة، فتُعاد الإزاحة للعرض.
const iso = (d: Date) => new Date(d.getTime() + IRAQ_OFFSET_MS).toISOString().slice(0, 10);

/** يفكّك YYYY-MM-DD إلى منتصف ليل بغداد الحقيقي. */
function iraqDay(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const d = iraqMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * يحسب مدى التقرير: مدى مخصّص (from/to) إن وُجد وصحّ، وإلا فترة جاهزة
 * (period)، وإلا هذه السنة. يتيح للمالك تحديد من أي يوم/شهر لأي يوم/شهر بدل
 * الفترات الثابتة.
 */
export function resolveRange(params: SearchParams): ResolvedRange {
  const rawFrom = one(params.from);
  const rawTo = one(params.to);

  if (rawFrom && rawTo) {
    // المدى المخصّص بيوم بغداد: من منتصف ليل «من» إلى نهاية يوم «إلى» — كان
    // يُفسَّر بتوقيت الخادم UTC فتنزاح النافذة ثلاث ساعات عن يوم العمل.
    const from = iraqDay(rawFrom);
    const toStart = iraqDay(rawTo);
    if (from && toStart && from <= toStart) {
      const to = new Date(toStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      return { from, to, period: null, fromStr: rawFrom, toStr: rawTo };
    }
  }

  const rawPeriod = one(params.period);
  const period: Period = rawPeriod && isPeriod(rawPeriod) ? rawPeriod : 'YEAR';
  const { from, to } = periodRange(period);
  return { from, to, period, fromStr: iso(from), toStr: iso(to) };
}
