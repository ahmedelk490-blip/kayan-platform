import { Decimal, dec, calc, type Numeric } from './money.ts';

/**
 * Reporting — pure aggregation.
 *
 * No database, no framework (Article 1). Every figure a report shows is
 * computed here from rows the caller has already fetched, so the arithmetic
 * can be tested without a server.
 *
 * ── One rule shapes this whole file ─────────────────────────
 *
 * A report must never present an absence as a measurement. Zero revenue
 * because nothing was sold and zero revenue because nothing was recorded look
 * identical in a total, and a manager cannot tell them apart. So every
 * aggregate here carries its own `count`, and the UI is expected to say "no
 * data yet" rather than draw a confident zero.
 */

// ── Periods ─────────────────────────────────────────────────

export const PERIODS = ['MONTH', 'QUARTER', 'YEAR', 'ALL'] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_AR: Record<Period, string> = {
  MONTH: 'هذا الشهر',
  QUARTER: 'هذا الربع',
  YEAR: 'هذه السنة',
  ALL: 'كل الفترات',
};

/** إزاحة توقيت العراق: UTC+3 ثابتة بلا توقيت صيفي. يوم العمل يومُ بغداد لا يوم الخادم. */
export const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;

/** لحظة «الآن» منقولة لعقارب بغداد — اقرأ مكوّناتها بدوال getUTC*. */
export function iraqNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + IRAQ_OFFSET_MS);
}

/** سنة العراق الحالية — لترقيم المستندات، فلا يبدأ عامُ بغداد بأرقام العام الماضي. */
export function iraqYear(now: Date = new Date()): number {
  return iraqNow(now).getUTCFullYear();
}

/** منتصف ليل بغداد ليومٍ معيّن، كنقطة زمنية UTC حقيقية. */
export function iraqMidnight(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day) - IRAQ_OFFSET_MS);
}

/**
 * Start and end of a period, anchored on a reference date — **بيوم العراق**.
 *
 * الخادم يعمل بـUTC وبغداد +3: حسابُ الحدود بتوقيت الخادم كان يزيح كل
 * تقرير ثلاث ساعات، فتسقط فواتير أول الليل من تقرير يومها وتُحسب في اليوم
 * السابق. الحدود تُبنى من مكوّنات تاريخ بغداد ثم تُعاد كنقاط UTC، فتصحّ
 * على أي خادم أياً كانت منطقته.
 *
 * `ALL` returns a window wide enough to hold any record this system could
 * hold, rather than null — a caller that forgets to branch then gets
 * everything, which is what ALL means, instead of a crash.
 */
export function periodRange(period: Period, now: Date = new Date()): { from: Date; to: Date } {
  const ref = iraqNow(now);
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();

  switch (period) {
    case 'MONTH':
      return {
        from: iraqMidnight(year, month, 1),
        to: new Date(iraqMidnight(year, month + 1, 1).getTime() - 1),
      };
    case 'QUARTER': {
      const firstMonth = Math.floor(month / 3) * 3;
      return {
        from: iraqMidnight(year, firstMonth, 1),
        to: new Date(iraqMidnight(year, firstMonth + 3, 1).getTime() - 1),
      };
    }
    case 'YEAR':
      return {
        from: iraqMidnight(year, 0, 1),
        to: new Date(iraqMidnight(year + 1, 0, 1).getTime() - 1),
      };
    case 'ALL':
      return { from: new Date(Date.UTC(2000, 0, 1)), to: new Date(Date.UTC(2999, 11, 31)) };
  }
}

export function isPeriod(v: string): v is Period {
  return (PERIODS as readonly string[]).includes(v);
}

/** `2026-08` — the key a monthly series is grouped by (بشهر بغداد لا شهر الخادم). */
export function monthKey(date: Date): string {
  const d = iraqNow(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── Totals that know whether they are empty ─────────────────

export interface Total {
  value: Decimal;
  /** How many rows produced it. Zero means "nothing recorded", not "zero". */
  count: number;
}

export function total(values: Numeric[]): Total {
  return {
    value: calc(values.reduce<Decimal>((sum, v) => sum.plus(dec(v)), new Decimal(0))),
    count: values.length,
  };
}

/** True when a figure has no rows behind it and must not be read as a result. */
export function isEmpty(t: Total): boolean {
  return t.count === 0;
}

/** Mean, or null when there is nothing to average — never a division by zero. */
export function average(t: Total): Decimal | null {
  if (t.count === 0) return null;
  return calc(t.value.dividedBy(t.count));
}

// ── Monthly series ──────────────────────────────────────────

export interface SeriesPoint {
  key: string;
  value: Decimal;
  count: number;
}

/**
 * Group dated amounts into a monthly series.
 *
 * Months with no rows are included with a zero and a count of zero, so a gap
 * in trading reads as a gap rather than as a missing month the eye skips over.
 */
export function monthlySeries(
  rows: { date: Date; amount: Numeric }[],
  from: Date,
  to: Date,
): SeriesPoint[] {
  const buckets = new Map<string, { value: Decimal; count: number }>();

  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const last = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= last) {
    buckets.set(monthKey(cursor), { value: new Decimal(0), count: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const row of rows) {
    const key = monthKey(row.date);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the window
    bucket.value = calc(bucket.value.plus(dec(row.amount)));
    bucket.count += 1;
  }

  return [...buckets.entries()].map(([key, b]) => ({ key, value: b.value, count: b.count }));
}

/** The largest value in a series, for scaling a bar chart. Never zero. */
export function seriesPeak(series: SeriesPoint[]): Decimal {
  const peak = series.reduce<Decimal>(
    (max, point) => (point.value.gt(max) ? point.value : max),
    new Decimal(0),
  );
  // A peak of zero would make every bar full height on division.
  return peak.lte(0) ? new Decimal(1) : peak;
}

// ── Inventory valuation ─────────────────────────────────────

export interface ValuationRow {
  onHand: Numeric;
  unitCost: Numeric | null;
}

export interface Valuation {
  value: Decimal;
  units: Decimal;
  /** Rows holding stock whose cost nobody has entered. */
  unpricedRows: number;
}

/**
 * Stock at cost.
 *
 * Rows with no cost contribute nothing to the value and are COUNTED
 * separately. Treating an unknown cost as zero would understate the holding
 * silently, which is the kind of error that only surfaces at a stocktake.
 */
export function valuation(rows: ValuationRow[]): Valuation {
  let value = new Decimal(0);
  let units = new Decimal(0);
  let unpriced = 0;

  for (const row of rows) {
    const quantity = dec(row.onHand);
    units = units.plus(quantity);

    if (row.unitCost === null || dec(row.unitCost).lte(0)) {
      if (quantity.gt(0)) unpriced += 1;
      continue;
    }
    value = value.plus(quantity.times(dec(row.unitCost)));
  }

  return { value: calc(value), units: calc(units), unpricedRows: unpriced };
}

// ── Profitability ───────────────────────────────────────────

export interface ProfitRow {
  label: string;
  revenue: Numeric;
  cost: Numeric | null;
  quantity: Numeric;
}

export interface ProfitLine {
  label: string;
  revenue: Decimal;
  cost: Decimal | null;
  grossProfit: Decimal | null;
  marginPercent: Decimal | null;
  quantity: Decimal;
  /** True when no cost snapshot exists, so profit is unknown, not zero. */
  costUnknown: boolean;
}

/**
 * Revenue against cost, per line.
 *
 * A missing cost yields `null` profit rather than a profit equal to the whole
 * revenue. That distinction is the entire value of this report: "we do not
 * know what this cost" and "this cost nothing" lead to opposite decisions.
 */
export function profitability(rows: ProfitRow[]): ProfitLine[] {
  return rows.map((row) => {
    const revenue = dec(row.revenue);
    const costUnknown = row.cost === null;
    const cost = costUnknown ? null : dec(row.cost as Numeric);
    const grossProfit = cost === null ? null : calc(revenue.minus(cost));

    return {
      label: row.label,
      revenue,
      cost,
      grossProfit,
      marginPercent:
        grossProfit === null || revenue.lte(0)
          ? null
          : calc(grossProfit.dividedBy(revenue).times(100)),
      quantity: dec(row.quantity),
      costUnknown,
    };
  });
}

// ── Production throughput ───────────────────────────────────

export interface ThroughputRow {
  status: string;
  quantity: Numeric;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface Throughput {
  byStatus: Record<string, { orders: number; quantity: Decimal }>;
  completedOrders: number;
  completedQuantity: Decimal;
  /** Mean days from start to completion. Null when nothing has completed. */
  averageDays: number | null;
}

export function throughput(rows: ThroughputRow[]): Throughput {
  const byStatus: Record<string, { orders: number; quantity: Decimal }> = {};
  let completedOrders = 0;
  let completedQuantity = new Decimal(0);
  let totalDays = 0;
  let timed = 0;

  for (const row of rows) {
    const bucket = (byStatus[row.status] ??= { orders: 0, quantity: new Decimal(0) });
    bucket.orders += 1;
    bucket.quantity = calc(bucket.quantity.plus(dec(row.quantity)));

    if (row.status !== 'COMPLETED') continue;
    completedOrders += 1;
    completedQuantity = calc(completedQuantity.plus(dec(row.quantity)));

    // Only orders that recorded both ends can contribute a cycle time.
    if (!row.startedAt || !row.completedAt) continue;
    const days = (row.completedAt.getTime() - row.startedAt.getTime()) / 86_400_000;
    if (days < 0) continue; // clock skew or a corrected record
    totalDays += days;
    timed += 1;
  }

  return {
    byStatus,
    completedOrders,
    completedQuantity,
    averageDays: timed === 0 ? null : Math.round((totalDays / timed) * 10) / 10,
  };
}
