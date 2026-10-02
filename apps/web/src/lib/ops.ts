import 'server-only';

import { IRAQ_OFFSET_MS, iraqMidnight } from '@erp/domain';
import { prisma } from './prisma';

/**
 * Shared plumbing for the operations modules — expenses, damage, penalties.
 *
 * Lives outside the `'use server'` files because those may only export async
 * functions, and a form-state type is not one.
 */

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

type Numbered = 'secondaryExpense' | 'damageRecord' | 'penalty' | 'employeePayment';

/**
 * Where the numbers are read from: the pooled client, or the transaction the
 * caller is already inside. Inside a transaction the pooled client takes a
 * second connection while the first is held, and with a pool of five that is
 * how a burst of writes turns into a wait.
 */
type NumberSource = Pick<typeof prisma, Numbered>;

/**
 * Next document number, scoped to tenant and year: EXP-2026-0001.
 *
 * Derived from the highest existing number rather than a counter table, so
 * it cannot drift out of step with reality. Not gapless — DI-6 requires that
 * only for fiscal documents, and none of these are.
 */
export async function nextOpsNumber(
  model: Numbered,
  prefix: string,
  tenantId: string,
  db: NumberSource = prisma,
): Promise<string> {
  const stem = `${prefix}-${new Date().getFullYear()}-`;
  const where = { tenantId, number: { startsWith: stem } };
  const select = { number: true } as const;

  const rows =
    model === 'secondaryExpense'
      ? await db.secondaryExpense.findMany({ where, select })
      : model === 'damageRecord'
        ? await db.damageRecord.findMany({ where, select })
        : model === 'penalty'
          ? await db.penalty.findMany({ where, select })
          : await db.employeePayment.findMany({ where, select });

  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.number.slice(stem.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);

  return `${stem}${String(max + 1).padStart(4, '0')}`;
}

/** Parse a date input, falling back to today rather than to null. */
export function parseDateOr(value: string | null | undefined, fallback = new Date()): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Format a Date for an `<input type="date">`. */
export function dateInput(value: Date | null | undefined): string {
  // يوم بغداد لا يوم UTC: بعد منتصف الليل كانت خانة «اليوم» تقول أمس.
  // (تاريخٌ خُزّن منتصفَ ليل UTC أو منتصفَ ليل بغداد يبقى يومه نفسه.)
  return value ? new Date(value.getTime() + IRAQ_OFFSET_MS).toISOString().slice(0, 10) : '';
}

/** «YYYY-MM-DDTHH:mm» بساعة بغداد — قيمة خانة `<input type="datetime-local">`. */
export function dateTimeInput(value: Date | null | undefined): string {
  return value ? new Date(value.getTime() + IRAQ_OFFSET_MS).toISOString().slice(0, 16) : '';
}

/**
 * تاريخ الفاتورة ووقتها كما اختارهما البائع (بساعة بغداد) — أو null للحظة الحالية.
 *
 * تلقائيّان بالآن، ويغيّرهما البائع من الفاتورة أو الكاشير حين يخصّ الطلب وقتاً
 * آخر — طلبٌ أُدخل بعد منتصف الليل يخصّ أمس مثلاً (بطلب المالك). `auto` يعني أن
 * الخانة لم تُلمس: اللحظة الحالية لا ما كانت عليه الخانة حين فُتحت الصفحة.
 * ويُقبل التاريخ وحده أيضاً (اليوم ← الآن، ويومٌ آخر ← ظهره). ولا وقت بعد الآن.
 */
export function chosenIssueAt(
  raw: FormDataEntryValue | null,
  auto: boolean,
): { at: Date } | { error: string } | null {
  if (auto) return null;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
  if (!m) return { error: 'التاريخ غير صالح.' };
  const midnight = iraqMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const now = Date.now();
  const at =
    m[4] !== undefined
      ? midnight + (Number(m[4]) * 60 + Number(m[5])) * 60_000
      : `${m[1]}-${m[2]}-${m[3]}` === dateInput(new Date())
        ? now
        : midnight + 12 * 60 * 60_000;
  if (at > now + 5 * 60_000) return { error: 'التاريخ والوقت لا يكونان بعد الآن.' };
  return { at: new Date(at) };
}

/** First and last instant of a YYYY-MM month string, defaulting to now. */
export function monthRange(month?: string): { from: Date; to: Date; key: string } {
  const now = new Date();
  const [y, m] = (month ?? '').split('-').map((v) => Number.parseInt(v, 10));
  const year = Number.isFinite(y) ? y : now.getFullYear();
  const monthIndex = Number.isFinite(m) ? m - 1 : now.getMonth();

  const from = new Date(year, monthIndex, 1);
  // Day 0 of the next month is the last day of this one — avoids the
  // 28/29/30/31 problem entirely.
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return { from, to, key: `${year}-${String(monthIndex + 1).padStart(2, '0')}` };
}
