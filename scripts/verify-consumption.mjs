/**
 * تحقّق من خطة الاستهلاك.
 *
 * هذه الطبقة **تحسب ولا تكتب**، وهي الأساس الذي سيقوم عليه خصم المخزون.
 * فتُهاجَم هنا قبل أن تُوصل بأي دفتر: خطأ في الحساب يُمسك باختبار، وخطأ في
 * الخصم لا يظهر إلا حين ينفد حبر يقول النظام إنه موجود.
 *
 * الأرقام من إدارة كيان: رول 100م لكل 500 قطعة، 4 علب أبيض، 3 أصفر،
 * ونصف علبة لكل من الأحمر والأزرق والأسود.
 */
import { PrismaClient } from '@prisma/client';
import { planConsumption } from '../packages/domain/src/consumption.ts';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const T = 'kayan';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const n = (v) => Number(v.toString());

const toEngine = (row, formulaId) => ({
  id: row.id,
  formulaId,
  formulaVersionId: row.formulaVersionId,
  version: 1,
  sequence: row.sequence,
  category: row.category,
  nameAr: row.nameAr,
  basis: row.basis,
  unit: row.unit,
  quantityPerBasis: row.quantity,
  yieldQty: row.yieldQty,
  unitCost: row.unitCost,
});

async function main() {
  const formula = await prisma.formula.findFirst({
    where: { tenantId: T, code: 'FRM-PRINT-TSHIRT', isDeleted: false },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1, include: { lines: true } },
    },
  });
  if (!formula) return check('معادلة طباعة التيشيرت موجودة', false), report();
  check('معادلة طباعة التيشيرت موجودة', true, `${formula.versions[0].lines.length} بنود`);

  const lines = formula.versions[0].lines.map((l) => toEngine(l, formula.id));

  const supplies = await prisma.supply.findMany({
    where: { tenantId: T, isDeleted: false },
    select: { id: true, nameAr: true, unit: true, onHand: true, minStock: true },
  });
  check('المستلزمات مسجّلة', supplies.length > 0, `${supplies.length} صنفاً`);

  // ── 500 قطعة = رول كامل بأحباره ──────────────────────────
  const plan = planConsumption(lines, 500, supplies);

  const roll = plan.deductions.find((d) => d.nameAr.includes('رول'));
  check(
    '500 قطعة تستهلك 100 متر — رول كامل',
    roll !== undefined && n(roll.quantity) === 100,
    roll ? `${roll.quantity} ${roll.unit ?? ''}` : 'لم يُطابق',
  );

  const white = plan.deductions.find((d) => d.nameAr.includes('أبيض'));
  check(
    'وتستهلك 4 علب حبر أبيض',
    white !== undefined && n(white.quantity) === 4,
    white ? `${white.quantity}` : 'لم يُطابق',
  );

  const yellow = plan.deductions.find((d) => d.nameAr.includes('أصفر'));
  check('و3 علب أصفر', yellow !== undefined && n(yellow.quantity) === 3, yellow ? `${yellow.quantity}` : '—');

  const red = plan.deductions.find((d) => d.nameAr.includes('أحمر'));
  check('ونصف علبة أحمر', red !== undefined && n(red.quantity) === 0.5, red ? `${red.quantity}` : '—');

  // ── الكميات الصغيرة لا تُقرَّب ───────────────────────────
  //
  // قبعة واحدة من رول يطلع 4000: 0.000125 علبة. التقريب إلى 4 خانات
  // يجعلها 0.0001 ويضخّم الاستهلاك 20% — وهو خطأ يتراكم على آلاف القطع.
  const one = planConsumption(lines, 1, supplies);
  const oneWhite = one.deductions.find((d) => d.nameAr.includes('أبيض'));
  check(
    'قطعة واحدة تستهلك 0.008 علبة — بلا تقريب',
    oneWhite !== undefined && n(oneWhite.quantity) === 0.008,
    oneWhite ? `${oneWhite.quantity}` : '—',
  );

  // ── ما لا يُطابق يُعلَن ولا يُسقط ────────────────────────
  //
  // بند يستهلك ولا يجد مستلزماً: إسقاطه بصمت يعني طلباً يستنزف حبراً لا
  // يُخصم من رصيده، فيبدو المخزون أوفر مما هو.
  const fake = [...lines, { ...lines[0], id: 'fake', nameAr: 'خامة غير مسجّلة', sequence: 99 }];
  const withGap = planConsumption(fake, 500, supplies);
  check(
    'بند بلا مستلزم مطابق يُعلَن في unmatched',
    withGap.unmatched.length === 1 && withGap.unmatched[0].nameAr === 'خامة غير مسجّلة',
    `${withGap.unmatched.length} بند غير مطابق`,
  );
  check(
    'ولا يُخصم من مستلزم آخر بالخطأ',
    withGap.deductions.length === plan.deductions.length,
  );

  // ── الرصيد غير الكافي يمنع ───────────────────────────────
  const empty = supplies.map((s) => ({ ...s, onHand: '0', minStock: '2' }));
  const short = planConsumption(lines, 500, empty);
  check(
    'رصيد صفر مع طلب 500 قطعة → blocked',
    short.blocked === true,
    'القرار بعدها للإنسان لا للدالة',
  );
  check(
    'وكل بند يُعلَن أنه غير كافٍ',
    short.deductions.every((d) => d.insufficient),
    `${short.deductions.length} بنداً`,
  );

  // ── التنبيه قبل الهبوط تحت الحد ──────────────────────────
  const stocked = supplies.map((s) => ({ ...s, onHand: '5', minStock: '4' }));
  const willLow = planConsumption(lines, 100, stocked);
  const w = willLow.deductions.find((d) => d.nameAr.includes('أبيض'));
  check(
    '5 علب وطلب 100 قطعة (0.8) → يبقى 4.2 فوق الحد 4',
    w !== undefined && n(w.onHandAfter) === 4.2 && w.willBeLow === false,
    w ? `يبقى ${w.onHandAfter}` : '—',
  );

  const willLow2 = planConsumption(lines, 500, stocked);
  const w2 = willLow2.deductions.find((d) => d.nameAr.includes('أبيض'));
  check(
    'وطلب 500 قطعة (4 علب) → يبقى 1 تحت الحد، فيُنبَّه',
    w2 !== undefined && w2.willBeLow === true,
    w2 ? `يبقى ${w2.onHandAfter} والحد ${4}` : '—',
  );

  // ── لا كتابة ─────────────────────────────────────────────
  const before = await prisma.supplyTransaction.count({ where: { tenantId: T } });
  planConsumption(lines, 500, supplies);
  const after = await prisma.supplyTransaction.count({ where: { tenantId: T } });
  check(
    'الحساب لا يكتب شيئاً في دفتر المستلزمات',
    before === after,
    `${after} حركة قبل وبعد — الفصل متعمّد`,
  );

  report();
}

function report() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} تحقّقاً ناجحاً`);
  if (passed !== results.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
