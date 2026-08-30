import { Decimal, dec, calc, type Numeric } from './money.ts';

/**
 * Operations — secondary expenses, damage, penalties, supplies.
 *
 * Pure data and pure functions (Article 1). These three areas share one
 * property that shapes every rule below: they all move money away from the
 * business on someone's say-so, so every one of them has an approval gate
 * and none of them counts until it passes.
 */

// ── Secondary expenses ──────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'FOOD',
  'TRANSPORT',
  'FUEL',
  'ELECTRICITY',
  'WATER',
  'INTERNET',
  'CLEANING',
  'OFFICE',
  'MAINTENANCE',
  'RENT',
  // بنود تخصّ التشغيل والمشتريات — تُخصم من الربح في التقرير المالي.
  'SUPPLIES',
  'INK',
  'PRINTING_ROLL',
  'THREAD',
  'RAW_MATERIAL',
  'EQUIPMENT',
  'SHIPPING',
  'PACKAGING',
  'ADVERTISING',
  'TELECOM',
  'LEGAL',
  'BANK_FEES',
  'GOV_FEES',
  'ASSETS',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_AR: Record<ExpenseCategory, string> = {
  FOOD: 'طعام',
  TRANSPORT: 'مواصلات',
  FUEL: 'وقود',
  ELECTRICITY: 'كهرباء',
  WATER: 'مياه',
  INTERNET: 'إنترنت',
  CLEANING: 'نظافة',
  OFFICE: 'أدوات مكتبية',
  MAINTENANCE: 'صيانة',
  RENT: 'إيجار',
  SUPPLIES: 'مستلزمات ولوازم',
  INK: 'أحبار',
  PRINTING_ROLL: 'رولات طباعة',
  THREAD: 'خيوط',
  RAW_MATERIAL: 'خامات',
  EQUIPMENT: 'معدات وأدوات',
  SHIPPING: 'شحن وتوصيل',
  PACKAGING: 'تغليف',
  ADVERTISING: 'دعاية وإعلان',
  TELECOM: 'اتصالات',
  LEGAL: 'قانونية ومحاسبية',
  BANK_FEES: 'رسوم ومصاريف بنكية',
  GOV_FEES: 'رسوم حكومية وتراخيص',
  ASSETS: 'أصول ومقتنيات',
  OTHER: 'أخرى',
};

// ── Approval, shared by expenses and damage ─────────────────

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_STATUS_AR: Record<ApprovalStatus, string> = {
  PENDING: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

/**
 * Approval is one-way.
 *
 * Un-approving a settled expense would rewrite a period that has already
 * been reported on. A mistake is corrected by a reversing entry, the same
 * rule the stock ledger follows (DI-2).
 */
export const APPROVAL_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: ['PENDING'],
};

// ── Damage ──────────────────────────────────────────────────

export const DAMAGE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] as const;
export type DamageStatus = (typeof DAMAGE_STATUSES)[number];

export const DAMAGE_STATUS_AR: Record<DamageStatus, string> = {
  DRAFT: 'مسودة',
  PENDING: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

export const DAMAGE_TRANSITIONS: Record<DamageStatus, DamageStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: ['DRAFT'],
};

/**
 * Total cost of a damage incident.
 *
 * Material and labour are entered separately rather than as one figure
 * because they answer different questions: material is what the business
 * lost, labour is what it paid twice for.
 */
export function damageTotal(materialCost: Numeric, laborCost: Numeric): Decimal {
  return calc(dec(materialCost).plus(dec(laborCost)));
}

// ── Penalties ───────────────────────────────────────────────

export const PENALTY_STATUSES = ['PENDING', 'APPROVED', 'PAID', 'CANCELLED'] as const;
export type PenaltyStatus = (typeof PENALTY_STATUSES)[number];

export const PENALTY_STATUS_AR: Record<PenaltyStatus, string> = {
  PENDING: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  PAID: 'مُحصَّل',
  CANCELLED: 'ملغي',
};

/**
 * A penalty may be cancelled right up until it is collected, and never
 * after. Once money has changed hands the record is history, and history is
 * corrected by another record, not by editing this one.
 */
export const PENALTY_TRANSITIONS: Record<PenaltyStatus, PenaltyStatus[]> = {
  PENDING: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

/**
 * A penalty must never exceed the damage it answers for.
 *
 * This is a deliberate guard, not an accounting nicety: an unbounded penalty
 * against an employee's pay is the kind of thing a system should refuse to
 * help with. The cap is the assessed damage cost.
 */
export function penaltyExceedsDamage(amount: Numeric, damageCost: Numeric): boolean {
  return dec(amount).gt(dec(damageCost));
}

// ── Supplies ────────────────────────────────────────────────

/**
 * مصدر الطلب — من أين جاء الزبون. يُختار عند إنشاء الفاتورة، ويُضبط تلقائياً
 * للكاشير والموقع، فنعرف أكثر قناة تجلب الطلبات.
 */
export const ORDER_SOURCES = [
  'MESSENGER',
  'INSTAGRAM',
  'WHATSAPP',
  'LEAD_MESSAGE',
  'LEAD_CALL',
  'CASHIER',
  'SITE',
  'OTHER',
] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_AR: Record<OrderSource, string> = {
  MESSENGER: 'ماسنجر',
  INSTAGRAM: 'انستا',
  WHATSAPP: 'واتساب',
  LEAD_MESSAGE: 'ليدز رسالة',
  LEAD_CALL: 'ليدز مكالمة',
  CASHIER: 'كاشير',
  SITE: 'الموقع',
  OTHER: 'أخرى',
};

export function isOrderSource(v: string): v is OrderSource {
  return (ORDER_SOURCES as readonly string[]).includes(v);
}

/** المصادر المعروضة في فورم إنشاء الفاتورة (يدوية) — بلا كاشير/موقع التلقائيين. */
export const MANUAL_ORDER_SOURCES: readonly OrderSource[] = [
  'MESSENGER',
  'INSTAGRAM',
  'WHATSAPP',
  'LEAD_MESSAGE',
  'LEAD_CALL',
  'OTHER',
];

export const SUPPLY_KINDS = ['PRINTING', 'EMBROIDERY'] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];

export const SUPPLY_KIND_AR: Record<SupplyKind, string> = {
  PRINTING: 'مستلزمات طباعة',
  EMBROIDERY: 'مستلزمات تطريز',
};

/**
 * Categories are kind-specific. A thread is not a printing supply and a roll
 * is not an embroidery one, so the two lists never mix in a picker.
 */
export const SUPPLY_CATEGORIES: Record<SupplyKind, readonly string[]> = {
  PRINTING: ['ROLL', 'INK', 'CLEANING', 'TRANSFER_PAPER', 'OTHER'],
  EMBROIDERY: ['THREAD', 'NEEDLE', 'FRAME', 'BACKING', 'OTHER'],
};

export const SUPPLY_CATEGORY_AR: Record<string, string> = {
  ROLL: 'رولات',
  INK: 'أحبار',
  CLEANING: 'محاليل تنظيف',
  TRANSFER_PAPER: 'ورق حراري / ترانسفير',
  THREAD: 'خيوط',
  NEEDLE: 'إبر',
  FRAME: 'فرايم / إطارات',
  BACKING: 'باكينج / مثبّتات',
  OTHER: 'أخرى',
};

export const SUPPLY_TX_TYPES = ['PURCHASE', 'CONSUMPTION'] as const;
export type SupplyTxType = (typeof SUPPLY_TX_TYPES)[number];

export const SUPPLY_TX_TYPE_AR: Record<SupplyTxType, string> = {
  PURCHASE: 'شراء',
  CONSUMPTION: 'استهلاك',
};

/** Signed effect on the supply's on-hand quantity. */
export function supplyDelta(type: SupplyTxType, quantity: Numeric): Decimal {
  const q = dec(quantity);
  return type === 'PURCHASE' ? q : q.negated();
}

// ── Net profit ──────────────────────────────────────────────

export interface NetProfitInput {
  revenue: Numeric;
  /** Manufacturing cost from the Cost Engine. */
  manufacturingCost: Numeric;
  /** Approved secondary expenses for the period. */
  secondaryExpenses: Numeric;
  /** Approved damage cost for the period. */
  damageCost: Numeric;
  /** Penalties collected — these come back in, so they reduce the loss. */
  penaltiesRecovered?: Numeric;
}

export interface NetProfitResult {
  revenue: Decimal;
  manufacturingCost: Decimal;
  grossProfit: Decimal;
  secondaryExpenses: Decimal;
  damageCost: Decimal;
  penaltiesRecovered: Decimal;
  netProfit: Decimal;
  grossMarginPercent: Decimal | null;
  netMarginPercent: Decimal | null;
}

/**
 * Gross profit minus what the month actually cost to run.
 *
 * Only APPROVED expenses and damage belong here — a pending claim is not yet
 * a cost, and counting it would let anyone move the profit figure by filing
 * a form. Recovered penalties are subtracted from the loss rather than added
 * to revenue: collecting a penalty is not a sale.
 */
export function netProfit(input: NetProfitInput): NetProfitResult {
  const revenue = dec(input.revenue);
  const manufacturingCost = dec(input.manufacturingCost);
  const secondaryExpenses = dec(input.secondaryExpenses);
  const damageCost = dec(input.damageCost);
  const penaltiesRecovered = dec(input.penaltiesRecovered);

  const grossProfit = calc(revenue.minus(manufacturingCost));
  const net = calc(
    grossProfit.minus(secondaryExpenses).minus(damageCost).plus(penaltiesRecovered),
  );

  return {
    revenue,
    manufacturingCost,
    grossProfit,
    secondaryExpenses,
    damageCost,
    penaltiesRecovered,
    netProfit: net,
    grossMarginPercent: revenue.gt(0) ? calc(grossProfit.dividedBy(revenue).times(100)) : null,
    netMarginPercent: revenue.gt(0) ? calc(net.dividedBy(revenue).times(100)) : null,
  };
}

// ── Guards ──────────────────────────────────────────────────

export function isExpenseCategory(v: string): v is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}

export function isApprovalStatus(v: string): v is ApprovalStatus {
  return (APPROVAL_STATUSES as readonly string[]).includes(v);
}

export function isDamageStatus(v: string): v is DamageStatus {
  return (DAMAGE_STATUSES as readonly string[]).includes(v);
}

export function isPenaltyStatus(v: string): v is PenaltyStatus {
  return (PENALTY_STATUSES as readonly string[]).includes(v);
}

export function isSupplyKind(v: string): v is SupplyKind {
  return (SUPPLY_KINDS as readonly string[]).includes(v);
}

export function isSupplyTxType(v: string): v is SupplyTxType {
  return (SUPPLY_TX_TYPES as readonly string[]).includes(v);
}
