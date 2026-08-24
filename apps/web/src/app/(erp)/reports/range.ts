import { periodRange, isPeriod, type Period } from '@erp/domain';
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

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * يحسب مدى التقرير: مدى مخصّص (from/to) إن وُجد وصحّ، وإلا فترة جاهزة
 * (period)، وإلا هذه السنة. يتيح للمالك تحديد من أي يوم/شهر لأي يوم/شهر بدل
 * الفترات الثابتة.
 */
export function resolveRange(params: SearchParams): ResolvedRange {
  const rawFrom = one(params.from);
  const rawTo = one(params.to);

  if (rawFrom && rawTo) {
    const from = new Date(`${rawFrom}T00:00:00`);
    const to = new Date(`${rawTo}T23:59:59.999`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { from, to, period: null, fromStr: rawFrom, toStr: rawTo };
    }
  }

  const rawPeriod = one(params.period);
  const period: Period = rawPeriod && isPeriod(rawPeriod) ? rawPeriod : 'YEAR';
  const { from, to } = periodRange(period);
  return { from, to, period, fromStr: iso(from), toStr: iso(to) };
}
