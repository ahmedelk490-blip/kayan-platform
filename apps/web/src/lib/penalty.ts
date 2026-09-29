import { iraqMidnight, iraqNow } from '@erp/domain';

/**
 * خطّة تقسيط الجزاء والخصم — متى يبدأ الاستقطاع، وهل أُخذ قسط هذا الشهر.
 *
 * بلا عمودٍ جديد في قاعدة البيانات: شهر البداية قرارٌ يُقيَّد في سجلّ الجزاء
 * (PenaltyEvent) بعبارةٍ ثابتة تُقرأ هنا، ودفعة كل قسطٍ تحمل رقم الجزاء في
 * ملاحظتها. فلا تحتاج الميزة «تطبيق بنية» قبل أن تعمل، ولا يضيع القرار عمّن
 * اتّخذه ومتى.
 */

export interface PlanMonth {
  year: number;
  /** 1–12 */
  month: number;
}

const PLAN_MARK = 'يبدأ الاستقطاع شهر';

/** نصّ خطّة التقسيط كما يُقيَّد في سجلّ الجزاء — وهو ما يقرؤه planStart. */
export function planNote(installments: number, start: PlanMonth): string {
  return `خطّة التقسيط: ${installments} قسط — ${PLAN_MARK} ${start.month}/${start.year}`;
}

/** ملاحظة دفعة القسط — بها يُعرَف أيّ جزاءٍ استُقطع منه وفي أيّ شهر. */
export function installmentNote(penaltyNumber: string): string {
  return `قسط من الجزاء ${penaltyNumber}`;
}

/** هذا الشهر أو الذي بعده، بتوقيت بغداد. */
export function planMonth(which: 'this' | 'next', now: Date = new Date()): PlanMonth {
  const ref = iraqNow(now);
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + (which === 'next' ? 1 : 0), 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * شهر البداية من آخر خطّةٍ في السجلّ (الملاحظات بترتيبها الزمني).
 * null لجزاءٍ بلا خطّة: يُستقطع متى قرّر المدير، كما كان.
 */
export function planStart(notes: readonly (string | null | undefined)[]): PlanMonth | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const m = notes[i]?.match(/يبدأ الاستقطاع شهر (\d{1,2})\/(\d{4})/);
    if (m) return { year: Number(m[2]), month: Number(m[1]) };
  }
  return null;
}

/** هل حلّ شهر البداية؟ */
export function hasStarted(start: PlanMonth | null, now: Date = new Date()): boolean {
  if (!start) return true;
  const cur = planMonth('this', now);
  return cur.year * 12 + cur.month >= start.year * 12 + start.month;
}

/** أوّل لحظةٍ في شهر بغداد الحالي — ما استُقطع بعدها استُقطع «هذا الشهر». */
export function monthStartInstant(now: Date = new Date()): Date {
  const ref = iraqNow(now);
  return iraqMidnight(ref.getUTCFullYear(), ref.getUTCMonth(), 1);
}
