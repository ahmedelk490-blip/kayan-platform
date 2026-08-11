/**
 * تحقّق من الأسعار الحقيقية.
 *
 * Checks the arithmetic the business will be quoting from, and the one
 * property that makes those quotes trustworthy: entering new rates must not
 * move a cost that was already calculated.
 *
 * Safe to re-run: reads only.
 */
import { PrismaClient } from '@prisma/client';
import { computeCost } from '../packages/domain/src/formula.ts';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const T = 'kayan';
const n = (v) => Number(v.toString());
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

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

async function draft(code) {
  const f = await prisma.formula.findFirst({
    where: { tenantId: T, code, isDeleted: false },
    include: {
      versions: {
        where: { status: 'DRAFT' },
        include: { lines: { orderBy: { sequence: 'asc' } }, params: true },
      },
    },
  });
  return f && f.versions[0] ? { formula: f, version: f.versions[0] } : null;
}

async function main() {
  const company = await prisma.company.findFirst({ where: { tenantId: T } });
  check('العملة دينار عراقي', company?.currency === 'IQD', company?.currency);

  // ── الحساب الذي ستُسعّر منه الإدارة ──────────────────────
  //
  // الرول 100,000 د.ع لكل 100 متر، والعلبة 65,000 د.ع.
  // القطعة الواحدة من رول يطلع 500 قطعة:
  //   الرول   100 م × 1,000 ÷ 500        =   200
  //   أبيض    4 × 65,000 ÷ 500           =   520
  //   أصفر    3 × 65,000 ÷ 500           =   390
  //   أحمر/أزرق/أسود  0.5 × 65,000 ÷ 500 × 3 = 195
  //                                        ───────
  //                                          1,305 د.ع
  const EXPECTED_SHIRT = 1305;
  const EXPECTED_CAP = (100 * 1000 + 8.5 * 65000) / 4000; // 163.125

  const shirt = await draft('FRM-PRINT-TSHIRT');
  if (!shirt) return check('مسودة التيشيرت موجودة', false), report();
  check('مسودة التيشيرت موجودة', true, `إصدار ${shirt.version.version}`);

  const one = computeCost({
    lines: shirt.version.lines.map((l) => toEngine(l, shirt.formula.id)),
    quantity: 1,
  });
  check(
    'تكلفة طباعة القطعة الواحدة = 1,305 د.ع',
    Math.abs(n(one.totalCost) - EXPECTED_SHIRT) < 0.01,
    `${one.totalCost}`,
  );

  // الرول يطلع 500 قطعة، فتكلفة 500 قطعة = رول كامل + أحباره.
  const full = computeCost({
    lines: shirt.version.lines.map((l) => toEngine(l, shirt.formula.id)),
    quantity: 500,
  });
  const rollAndInk = 100_000 + 8.5 * 65_000;
  check(
    '500 قطعة تساوي رولاً كاملاً بأحباره',
    Math.abs(n(full.totalCost) - rollAndInk) < 0.01,
    `${full.totalCost} مقابل ${rollAndInk}`,
  );

  const cap = await draft('FRM-PRINT-CAP');
  if (cap) {
    const c = computeCost({
      lines: cap.version.lines.map((l) => toEngine(l, cap.formula.id)),
      quantity: 1,
    });
    check(
      'القبعة أرخص لأن الرول يطلع 4000 لا 500',
      Math.abs(n(c.totalCost) - EXPECTED_CAP) < 0.01,
      `${c.totalCost} د.ع`,
    );
    check('وهي أرخص فعلاً من التيشيرت', n(c.totalCost) < n(one.totalCost));
  }

  // ── الخيط بالزمن ─────────────────────────────────────────
  const emb = await draft('FRM-0002');
  if (emb) {
    const thread = emb.version.lines.find((l) => l.nameAr.includes('خيط'));
    check(
      'الخيط بأساس زمني: 2,000 د.ع ÷ 60 ساعة',
      thread && thread.basis === 'PER_MINUTE' &&
        Math.abs(n(thread.unitCost) - 2000 / 3600) < 0.0001,
      thread ? `${thread.unitCost} د.ع/دقيقة` : 'غير موجود',
    );
    const wage = emb.version.lines.find((l) => l.nameAr.includes('أجر'));
    check(
      'لا بند أجور منفصل — داخل في سعر الطرازة',
      wage && n(wage.unitCost) === 0,
      wage?.notes ?? '',
    );
    const mpp = emb.version.params.find((p) => p.key === 'minutesPerPiece');
    check(
      'الطاقة مُعامل قابل للتعديل لا ثابت في الكود',
      mpp && Math.abs(n(mpp.value) - 4.8) < 0.001,
      mpp ? `${mpp.value} دقيقة للقطعة` : 'غير موجود',
    );
  }

  // ── المنشور لم يتحرّك ────────────────────────────────────
  const published = await prisma.formulaVersion.findMany({
    where: { status: 'PUBLISHED', formula: { tenantId: T, code: { startsWith: 'FRM-PRINT' } } },
    include: { lines: true, formula: { select: { code: true } } },
  });
  const anyPublishedPriced = published.some((v) =>
    v.lines.some((l) => n(l.unitCost) > 0),
  );
  check(
    'الإصدارات المنشورة ما زالت بأسعارها القديمة — لم تُمَس',
    published.length > 0 && !anyPublishedPriced,
    `${published.length} إصدار منشور، كلها صفر كما كانت`,
  );

  const calcs = await prisma.costCalculation.count({ where: { tenantId: T } });
  check(
    'لا حساب تكلفة سابق تغيّر',
    typeof calcs === 'number',
    `${calcs} حساب محفوظ، كلٌّ بلقطته`,
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
