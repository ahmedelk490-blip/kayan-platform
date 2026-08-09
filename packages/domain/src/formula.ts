import { Decimal, dec, calc, type Numeric } from './money.ts';

/**
 * Formula Engine + Cost Engine.
 *
 * ── Why this is not an expression evaluator ──────────────────
 *
 * Constitution Article 5 forbids executing user formulas through `eval()` or
 * `new Function()`. That is not a stylistic rule: a manager typing an
 * expression into a text box is arbitrary code running on the server with
 * database access, and no amount of sanitising makes that safe.
 *
 * So a formula here is *structured data*, not text. Each component declares
 * what it consumes, on what basis it is consumed, and what a unit costs. The
 * engine is a fixed set of arithmetic rules over those declarations — every
 * number stays configurable by the manager, and nothing is ever interpreted.
 *
 * The cost of this choice is honest: a manager cannot invent a brand-new
 * kind of arithmetic. They can change every rate, quantity, yield and
 * percentage, and add or remove components freely. That covers printing and
 * embroidery costing as KAYAN actually does it, and it cannot execute code.
 *
 * Pure functions only — no database, no framework (Article 1).
 */

// ── Formula kinds ───────────────────────────────────────────

export const FORMULA_KINDS = ['PRINTING', 'EMBROIDERY', 'MANUFACTURING'] as const;
export type FormulaKind = (typeof FORMULA_KINDS)[number];

export const FORMULA_KIND_AR: Record<FormulaKind, string> = {
  PRINTING: 'طباعة',
  EMBROIDERY: 'تطريز',
  MANUFACTURING: 'تصنيع عام',
};

export const FORMULA_VERSION_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type FormulaVersionStatus = (typeof FORMULA_VERSION_STATUSES)[number];

export const FORMULA_VERSION_STATUS_AR: Record<FormulaVersionStatus, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشورة',
  ARCHIVED: 'مؤرشفة',
};

// ── Cost categories ─────────────────────────────────────────

/**
 * The eight buckets the cost breakdown reports. They map one-to-one onto the
 * chain the business asked for, so no line can land somewhere unreportable.
 */
export const COST_CATEGORIES = [
  'MATERIAL',
  'INK',
  'THREAD',
  'LABOR',
  'PACKAGING',
  'MACHINE',
  'OVERHEAD',
  'WASTE',
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_AR: Record<CostCategory, string> = {
  MATERIAL: 'خامات',
  INK: 'أحبار وطباعة',
  THREAD: 'خيوط وتطريز',
  LABOR: 'عمالة',
  PACKAGING: 'تغليف',
  MACHINE: 'تشغيل ماكينات',
  OVERHEAD: 'مصاريف غير مباشرة',
  WASTE: 'هالك وتالف',
};

// ── Consumption bases ───────────────────────────────────────

/**
 * How a component's quantity turns into a consumed quantity.
 *
 * These six cover the real cases:
 *   PER_PIECE          fabric per shirt, thread per cap
 *   PER_ORDER          screen setup, one-off preparation
 *   PER_YIELD          a 50 m roll that yields 400 pieces
 *   PER_1000_STITCHES  embroidery thread, priced per thousand stitches
 *   PER_MINUTE         labour and machine time
 *   PERCENT_OF_DIRECT  waste allowance, indirect expenses
 */
export const COST_BASES = [
  'PER_PIECE',
  'PER_ORDER',
  'PER_YIELD',
  'PER_1000_STITCHES',
  'PER_MINUTE',
  'PERCENT_OF_DIRECT',
] as const;
export type CostBasis = (typeof COST_BASES)[number];

export const COST_BASIS_AR: Record<CostBasis, string> = {
  PER_PIECE: 'لكل قطعة',
  PER_ORDER: 'لكل أمر إنتاج',
  PER_YIELD: 'لكل عدد قطع منتَج (رول/شاشة)',
  PER_1000_STITCHES: 'لكل ١٠٠٠ غرزة',
  PER_MINUTE: 'لكل دقيقة تشغيل',
  PERCENT_OF_DIRECT: '٪ من التكلفة المباشرة',
};

/** Bases that need `yieldQty` to mean anything. */
export function requiresYield(basis: CostBasis): boolean {
  return basis === 'PER_YIELD';
}

/** Bases that read a parameter off the formula version. */
export function requiresParams(basis: CostBasis): string[] {
  if (basis === 'PER_1000_STITCHES') return ['stitchCount'];
  if (basis === 'PER_MINUTE') return ['stitchesPerMinute', 'minutesPerPiece', 'setupMinutes'];
  return [];
}

// ── Well-known parameters ───────────────────────────────────

/**
 * Parameter keys the engine understands. The table itself is free-form, so a
 * manager may store others for documentation, but only these change a number.
 *
 * Every one of them is empty by default. The engine treats a missing
 * parameter as zero rather than substituting a guess — an invented default
 * would silently produce a plausible-looking cost that nobody chose.
 */
export const FORMULA_PARAMS = {
  stitchCount: { nameAr: 'عدد الغرز للقطعة', unit: 'غرزة' },
  stitchesPerMinute: { nameAr: 'سرعة الماكينة', unit: 'غرزة/دقيقة' },
  minutesPerPiece: { nameAr: 'دقائق التشغيل للقطعة', unit: 'دقيقة' },
  setupMinutes: { nameAr: 'دقائق التجهيز للأمر', unit: 'دقيقة' },
} as const;

export type FormulaParamKey = keyof typeof FORMULA_PARAMS;

export const FORMULA_PARAM_KEYS = Object.keys(FORMULA_PARAMS) as FormulaParamKey[];

// ── Engine input ────────────────────────────────────────────

export interface EngineLine {
  /** Identifies the source row so a snapshot can be traced back. */
  id: string;
  formulaId: string;
  formulaVersionId: string;
  /** The version number, carried so a snapshot reads without a join. */
  version: number;
  sequence: number;
  category: CostCategory;
  nameAr: string;
  basis: CostBasis;
  unit: string | null;
  /** Consumption per basis unit, or the percentage for PERCENT_OF_DIRECT. */
  quantityPerBasis: Numeric;
  /** Pieces produced by one `quantityPerBasis`. PER_YIELD only. */
  yieldQty?: Numeric | null;
  unitCost: Numeric;
}

export interface EngineInput {
  /** Pieces being produced. */
  quantity: Numeric;
  lines: EngineLine[];
  /** Merged parameters from every formula version involved. */
  params?: Record<string, Numeric>;
  /** If given, a suggested price is derived from it. */
  targetMarginPercent?: Numeric | null;
}

export interface ComputedLine extends EngineLine {
  /** Total consumption across the whole order, in `unit`. */
  consumedQty: Decimal;
  lineCost: Decimal;
}

export interface CostResult {
  lines: ComputedLine[];
  byCategory: Record<CostCategory, Decimal>;
  /** Everything except percentage-based lines. */
  directCost: Decimal;
  /** Percentage-based lines — waste and indirect expenses. */
  indirectCost: Decimal;
  totalCost: Decimal;
  costPerPiece: Decimal;
  /** Run minutes the time-based lines were charged on. */
  totalMinutes: Decimal;
  suggestedPrice: Decimal | null;
}

// ── The engine ──────────────────────────────────────────────

/**
 * Run time for the whole order.
 *
 * Embroidery derives it from stitch count and machine speed. Anything else
 * uses an explicit minutes-per-piece. Setup is charged once per order, not
 * per piece — which is the whole reason a big run is cheaper per piece.
 */
export function runMinutes(quantity: Numeric, params: Record<string, Numeric> = {}): Decimal {
  const qty = dec(quantity);
  const stitchCount = dec(params.stitchCount);
  const speed = dec(params.stitchesPerMinute);

  const perPiece = speed.gt(0) && stitchCount.gt(0)
    ? stitchCount.dividedBy(speed)
    : dec(params.minutesPerPiece);

  return calc(perPiece.times(qty).plus(dec(params.setupMinutes)));
}

/** Consumption for one line, before it is priced. */
function consumption(
  line: EngineLine,
  quantity: Decimal,
  params: Record<string, Numeric>,
  minutes: Decimal,
): Decimal {
  const per = dec(line.quantityPerBasis);

  switch (line.basis) {
    case 'PER_PIECE':
      return calc(per.times(quantity));

    case 'PER_ORDER':
      return calc(per);

    case 'PER_YIELD': {
      // A 50 m roll that yields 400 pieces costs 50/400 m per piece.
      // Charged proportionally, not rounded up to whole rolls: this is an
      // estimate of cost, and a part-used roll is not scrapped.
      const y = dec(line.yieldQty);
      if (y.lte(0)) return dec(0);
      return calc(per.times(quantity).dividedBy(y));
    }

    case 'PER_1000_STITCHES': {
      const stitches = dec(params.stitchCount).times(quantity);
      return calc(per.times(stitches).dividedBy(1000));
    }

    case 'PER_MINUTE':
      return calc(per.times(minutes));

    case 'PERCENT_OF_DIRECT':
      // Not a physical consumption — priced off the subtotal instead.
      return dec(0);
  }
}

/**
 * Compute a full cost breakdown.
 *
 * Two passes, and the order matters: direct lines are priced first, then
 * percentage lines are charged on that subtotal. A percentage of a
 * percentage would depend on row order, which is not a property a cost
 * should have.
 */
export function computeCost(input: EngineInput): CostResult {
  const quantity = dec(input.quantity);
  const params = input.params ?? {};
  const minutes = runMinutes(quantity, params);

  const ordered = [...input.lines].sort((a, b) => a.sequence - b.sequence);
  const direct: ComputedLine[] = [];
  const percent: EngineLine[] = [];

  for (const line of ordered) {
    if (line.basis === 'PERCENT_OF_DIRECT') {
      percent.push(line);
      continue;
    }
    const consumedQty = consumption(line, quantity, params, minutes);
    direct.push({ ...line, consumedQty, lineCost: calc(consumedQty.times(dec(line.unitCost))) });
  }

  const directCost = calc(direct.reduce((sum, l) => sum.plus(l.lineCost), new Decimal(0)));

  const charged: ComputedLine[] = percent.map((line) => ({
    ...line,
    consumedQty: dec(0),
    lineCost: calc(directCost.times(dec(line.quantityPerBasis)).dividedBy(100)),
  }));

  const indirectCost = calc(charged.reduce((sum, l) => sum.plus(l.lineCost), new Decimal(0)));
  const totalCost = calc(directCost.plus(indirectCost));

  const lines = [...direct, ...charged].sort((a, b) => a.sequence - b.sequence);

  const byCategory = Object.fromEntries(
    COST_CATEGORIES.map((c) => [c, new Decimal(0)]),
  ) as Record<CostCategory, Decimal>;
  for (const line of lines) {
    byCategory[line.category] = calc(byCategory[line.category].plus(line.lineCost));
  }

  return {
    lines,
    byCategory,
    directCost,
    indirectCost,
    totalCost,
    costPerPiece: quantity.gt(0) ? calc(totalCost.dividedBy(quantity)) : dec(0),
    totalMinutes: minutes,
    suggestedPrice: suggestPrice(
      quantity.gt(0) ? calc(totalCost.dividedBy(quantity)) : dec(0),
      input.targetMarginPercent,
    ),
  };
}

/**
 * Price that achieves a target margin on the selling price.
 *
 * Margin, not markup: a 25% margin means cost is 75% of the price. Confusing
 * the two is the single most common way a quoted price quietly loses money.
 * A margin of 100% or more is unreachable and returns null rather than
 * dividing by zero.
 */
export function suggestPrice(
  costPerPiece: Numeric,
  targetMarginPercent?: Numeric | null,
): Decimal | null {
  if (targetMarginPercent === null || targetMarginPercent === undefined) return null;
  const margin = dec(targetMarginPercent);
  if (margin.lt(0) || margin.gte(100)) return null;
  return calc(dec(costPerPiece).dividedBy(dec(1).minus(margin.dividedBy(100))));
}

export interface Profit {
  revenue: Decimal;
  cost: Decimal;
  grossProfit: Decimal;
  /** Percentage of revenue. Null when there is no revenue to take it of. */
  marginPercent: Decimal | null;
}

/** Gross profit and margin for a line or a document. */
export function profit(revenue: Numeric, cost: Numeric): Profit {
  const r = dec(revenue);
  const c = dec(cost);
  const grossProfit = calc(r.minus(c));
  return {
    revenue: r,
    cost: c,
    grossProfit,
    marginPercent: r.gt(0) ? calc(grossProfit.dividedBy(r).times(100)) : null,
  };
}

// ── Guards ──────────────────────────────────────────────────

export function isFormulaKind(v: string): v is FormulaKind {
  return (FORMULA_KINDS as readonly string[]).includes(v);
}

export function isCostCategory(v: string): v is CostCategory {
  return (COST_CATEGORIES as readonly string[]).includes(v);
}

export function isCostBasis(v: string): v is CostBasis {
  return (COST_BASES as readonly string[]).includes(v);
}

export function isFormulaVersionStatus(v: string): v is FormulaVersionStatus {
  return (FORMULA_VERSION_STATUSES as readonly string[]).includes(v);
}
