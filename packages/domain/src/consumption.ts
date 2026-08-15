import { Decimal } from 'decimal.js';
import { computeCost, type EngineLine } from './formula.ts';

/**
 * ما يُستهلك من المستلزمات لتنفيذ طلب.
 *
 * هذا الملف **يحسب ولا يكتب**. لا يلمس رصيداً ولا دفتراً. الكتابة خطوة
 * لاحقة منفصلة، وفصلها متعمّد: خصم خاطئ من المخزون لا يُكتشف إلا حين ينفد
 * حبر يقول النظام إنه موجود، بينما حساب خاطئ يُمسك باختبار.
 *
 * ── لماذا المطابقة بالاسم، ولماذا تُعلَن ──────────────────
 *
 * بنود المعادلة ترتبط بـ`Material`، والمستلزمات في جدول `Supply` — لا
 * مفتاح بينهما. فالمطابقة بالاسم العربي مؤقتة حتى يُضاف `supplyId` للبند.
 *
 * والأهم: البند الذي لا يجد مستلزماً **يُعاد في `unmatched` ولا يُسقط**.
 * إسقاطه بصمت يعني طلباً يستهلك حبراً لا يُخصم من رصيده، فيبدو المخزون
 * أوفر مما هو — وهو الخطأ الذي يوقف الإنتاج بلا إنذار.
 */

export interface SupplyRef {
  id: string;
  nameAr: string;
  unit: string | null;
  onHand: Decimal | string | number;
  minStock: Decimal | string | number;
}

export interface Deduction {
  supplyId: string;
  nameAr: string;
  unit: string | null;
  /** الكمية المستهلكة — غير مُقرَّبة. */
  quantity: Decimal;
  /** الرصيد قبل الخصم وبعده، لعرضهما قبل التأكيد. */
  onHandBefore: Decimal;
  onHandAfter: Decimal;
  /** يهبط تحت الحد الأدنى بعد هذا الطلب. */
  willBeLow: boolean;
  /** لا يكفي الرصيد أصلاً. */
  insufficient: boolean;
}

export interface ConsumptionPlan {
  deductions: Deduction[];
  /** بنود لم تُطابق أي مستلزم — تُعلَن ولا تُسقط. */
  unmatched: { nameAr: string; quantity: Decimal }[];
  /** هل يمنع شيء تنفيذ الطلب؟ */
  blocked: boolean;
}

/**
 * تطبيع للمقارنة.
 *
 * ⚠ المطابقة بالاسم حلّ مؤقت وهشّ. الصحيح `supplyId` على بند المعادلة،
 *   وحتى يُضاف يبقى `unmatched` هو شبكة الأمان — وقد أمسك فعلاً أن بند
 *   «رول طباعة (100 متر)» لا يطابق مستلزم «رول طباعة ١٠٠ متر»: أرقام
 *   هندية وأقواس. بلا ذلك الإعلان كان الرول ليُستهلك ولا يُخصم أبداً.
 *
 * فيُوحَّد: الأرقام الهندية إلى لاتينية، والهمزات والتاء المربوطة والألف
 * المقصورة، وتُحذف علامات الترقيم والمسافات الزائدة.
 */
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

function normalise(name: string): string {
  return name
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    // الأقواس والشرطات والنقاط لا تحمل معنى في اسم مستلزم.
    .replace(/[()[\]{}\-–—_.,،/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * خطة استهلاك طلب.
 *
 * تُرجع ما سيُخصم من كل مستلزم، والرصيد قبل وبعد، وما إذا كان الرصيد
 * يكفي. `blocked` صحيحة حين لا يكفي رصيد مستلزم — والقرار بعدها للإنسان،
 * لا لهذه الدالة.
 */
export function planConsumption(
  lines: EngineLine[],
  quantity: Decimal | string | number,
  supplies: SupplyRef[],
  params: Record<string, Decimal | string | number> = {},
): ConsumptionPlan {
  const computed = computeCost({ lines, quantity, params });

  const bySupplyName = new Map<string, SupplyRef>();
  for (const s of supplies) bySupplyName.set(normalise(s.nameAr), s);

  // بنود متعددة قد تشير لنفس المستلزم — تُجمع لا تُكتب مرتين.
  const totals = new Map<string, { supply: SupplyRef; quantity: Decimal }>();
  const unmatched: { nameAr: string; quantity: Decimal }[] = [];

  for (const line of computed.lines) {
    // البنود النسبية ليست استهلاكاً مادياً — لا تُخصم من مخزون.
    if (line.basis === 'PERCENT_OF_DIRECT') continue;
    if (line.consumedQty.lte(0)) continue;

    const supply = bySupplyName.get(normalise(line.nameAr));
    if (!supply) {
      unmatched.push({ nameAr: line.nameAr, quantity: line.consumedQty });
      continue;
    }

    const existing = totals.get(supply.id);
    if (existing) existing.quantity = existing.quantity.plus(line.consumedQty);
    else totals.set(supply.id, { supply, quantity: line.consumedQty });
  }

  const deductions: Deduction[] = [...totals.values()].map(({ supply, quantity: q }) => {
    const before = new Decimal(supply.onHand.toString());
    const after = before.minus(q);
    const min = new Decimal(supply.minStock.toString());
    return {
      supplyId: supply.id,
      nameAr: supply.nameAr,
      unit: supply.unit,
      quantity: q,
      onHandBefore: before,
      onHandAfter: after,
      // الحد الأدنى صفر يعني "بلا حد مضبوط" — لا تنبيه عليه.
      willBeLow: min.gt(0) && after.lte(min),
      insufficient: after.lt(0),
    };
  });

  return {
    deductions,
    unmatched,
    blocked: deductions.some((d) => d.insufficient),
  };
}
