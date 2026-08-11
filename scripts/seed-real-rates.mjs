/**
 * الأسعار الحقيقية من إدارة كيان — إدخال أوّلي.
 *
 * The numbers this system has been waiting for since Phase 6. Supplied by the
 * business on 2026-08-11:
 *
 *   الرول الكامل (100 متر)  100,000 د.ع
 *   علبة الحبر (أي لون)      65,000 د.ع
 *   الخيط                     2,000 د.ع لكل 60 ساعة تشغيل
 *   الطاقة اليومية            100 قطعة تطريز · 100 قطعة طباعة
 *   الأجور                    داخلة في سعر الطرازة — لا بند منفصل
 *
 * Two rules this script does NOT break:
 *
 *   1. It never touches a PUBLISHED version. Every rate lands in a NEW DRAFT
 *      that a manager reviews and publishes. Costs already calculated keep
 *      the rates that were in force when they were calculated — that is what
 *      makes an old quotation an offer rather than a guess.
 *
 *   2. It prices only what the business actually stated. Anything not
 *      supplied is left at zero so the existing "unpriced line" warning
 *      fires, because a cost that looks complete and is not is worse than
 *      one that visibly is not.
 *
 * Re-runnable: if a draft already exists for a formula it is refreshed rather
 * than duplicated.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const T = 'kayan';

// ── ما صرّح به العمل، وحده ──────────────────────────────────
const ROLL_TOTAL = 100_000; // د.ع للرول الكامل
const ROLL_METRES = 100; // متر في الرول
const ROLL_PER_METRE = ROLL_TOTAL / ROLL_METRES; // 1,000 د.ع للمتر
const INK_BOX = 65_000; // د.ع للعلبة، أي لون

// الخيط: 2,000 د.ع تكفي 60 ساعة تشغيل.
const THREAD_TOTAL = 2_000;
const THREAD_HOURS = 60;
const THREAD_PER_MINUTE = THREAD_TOTAL / (THREAD_HOURS * 60); // 0.5556 د.ع/دقيقة

// ساعات العمل لم تُحدَّد، فهي مُعامل قابل للتعديل لا ثابت في الكود.
// تُحوّل "100 قطعة يومياً" إلى دقائق لكل قطعة.
const WORKING_HOURS_PER_DAY = 8;
const DAILY_PIECES = 100;
const MINUTES_PER_PIECE = (WORKING_HOURS_PER_DAY * 60) / DAILY_PIECES; // 4.8

/** سعر الوحدة لكل بند، مفتاحه اسم البند كما هو مخزَّن. */
const PRINTING_RATES = {
  'رول طباعة (100 متر)': ROLL_PER_METRE,
  'حبر أبيض': INK_BOX,
  'حبر أصفر': INK_BOX,
  'حبر أحمر': INK_BOX,
  'حبر أزرق': INK_BOX,
  'حبر أسود': INK_BOX,
};

const results = [];
const note = (msg) => {
  results.push(msg);
  console.log(msg);
};

/**
 * افتح مسودة على المعادلة — أو أعِد استخدام المفتوحة — وانسخ إليها بنود
 * آخر إصدار كما هي، ثم طبّق الأسعار.
 */
async function draftFor(code) {
  const formula = await prisma.formula.findFirst({
    where: { tenantId: T, code, isDeleted: false },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        include: { lines: { orderBy: { sequence: 'asc' } }, params: true },
      },
    },
  });
  if (!formula) return null;

  const existingDraft = formula.versions.find((v) => v.status === 'DRAFT');
  if (existingDraft) return { formula, version: existingDraft };

  const latest = formula.versions[0];
  const created = await prisma.formulaVersion.create({
    data: {
      formulaId: formula.id,
      version: latest.version + 1,
      status: 'DRAFT',
      notes: 'أسعار حقيقية من الإدارة — بانتظار المراجعة والنشر.',
      lines: {
        create: latest.lines.map((l) => ({
          sequence: l.sequence,
          category: l.category,
          nameAr: l.nameAr,
          materialId: l.materialId,
          basis: l.basis,
          quantity: l.quantity,
          yieldQty: l.yieldQty,
          unit: l.unit,
          unitCost: l.unitCost,
          notes: l.notes,
        })),
      },
      params: {
        create: latest.params.map((p) => ({
          key: p.key,
          nameAr: p.nameAr,
          value: p.value,
          unit: p.unit,
        })),
      },
    },
    include: { lines: true },
  });
  return { formula, version: created };
}

async function main() {
  // ── العملة ───────────────────────────────────────────────
  const company = await prisma.company.findFirst({ where: { tenantId: T } });
  if (company && company.currency !== 'IQD') {
    await prisma.company.update({ where: { id: company.id }, data: { currency: 'IQD' } });
    note(`العملة: ${company.currency} ← IQD`);
  }

  // ── معادلات الطباعة الثلاث ───────────────────────────────
  for (const code of ['FRM-PRINT-TSHIRT', 'FRM-PRINT-CAP', 'FRM-PRINT-APRON']) {
    const found = await draftFor(code);
    if (!found) {
      note(`⚠ لم توجد ${code}`);
      continue;
    }
    const { formula, version } = found;
    const lines = await prisma.formulaLine.findMany({
      where: { formulaVersionId: version.id },
      orderBy: { sequence: 'asc' },
    });

    let priced = 0;
    for (const line of lines) {
      const rate = PRINTING_RATES[line.nameAr];
      if (rate === undefined) continue;
      await prisma.formulaLine.update({
        where: { id: line.id },
        data: { unitCost: rate.toFixed(4) },
      });
      priced += 1;
    }
    note(`${code} — مسودة ${version.version}: سُعّر ${priced}/${lines.length} بنداً`);
  }

  // ── التطريز: الخيط فقط، فهو وحده المُصرَّح به ─────────────
  const emb = await draftFor('FRM-0002');
  if (emb) {
    const lines = await prisma.formulaLine.findMany({
      where: { formulaVersionId: emb.version.id },
      orderBy: { sequence: 'asc' },
    });

    // حوّل الخيط إلى أساس زمني: العمل صرّح بتكلفته بالساعة لا بالجرام.
    const thread = lines.find((l) => l.nameAr.includes('خيط'));
    if (thread) {
      await prisma.formulaLine.update({
        where: { id: thread.id },
        data: {
          basis: 'PER_MINUTE',
          quantity: '1',
          unit: 'دقيقة',
          yieldQty: null,
          unitCost: THREAD_PER_MINUTE.toFixed(4),
          notes: `${THREAD_TOTAL} د.ع تكفي ${THREAD_HOURS} ساعة تشغيل.`,
        },
      });
      note(`FRM-0002 — الخيط: ${THREAD_PER_MINUTE.toFixed(4)} د.ع/دقيقة`);
    }

    // الأجور داخلة في سعر الطرازة، فلا بند أجور منفصل.
    const wage = lines.find((l) => l.nameAr.includes('أجر'));
    if (wage) {
      await prisma.formulaLine.update({
        where: { id: wage.id },
        data: {
          unitCost: '0',
          notes: 'الأجور داخلة في سعر الطرازة — لا تُحسب هنا مرة ثانية.',
        },
      });
      note('FRM-0002 — أجر المشغّل: صفر (داخل في سعر الطرازة)');
    }

    // مُعامل الطاقة، قابل للتعديل من الشاشة.
    for (const [key, nameAr, value, unit] of [
      ['workingHoursPerDay', 'ساعات العمل في اليوم', String(WORKING_HOURS_PER_DAY), 'ساعة'],
      ['dailyPieces', 'الطاقة اليومية', String(DAILY_PIECES), 'قطعة'],
      ['minutesPerPiece', 'دقائق لكل قطعة', MINUTES_PER_PIECE.toFixed(4), 'دقيقة'],
    ]) {
      await prisma.formulaParam.upsert({
        where: { formulaVersionId_key: { formulaVersionId: emb.version.id, key } },
        create: { formulaVersionId: emb.version.id, key, nameAr, value, unit },
        update: { value },
      });
    }
    note(`FRM-0002 — الطاقة: ${DAILY_PIECES} قطعة / ${WORKING_HOURS_PER_DAY} ساعة = ${MINUTES_PER_PIECE} دقيقة للقطعة`);
  }

  // ── ما بقي بلا سعر، معلناً ───────────────────────────────
  const drafts = await prisma.formulaVersion.findMany({
    where: { status: 'DRAFT', formula: { tenantId: T, isDeleted: false } },
    include: { formula: { select: { code: true } }, lines: true },
  });
  console.log('\n── بنود ما زالت بلا سعر ──');
  let unpriced = 0;
  for (const v of drafts) {
    for (const l of v.lines) {
      if (l.basis !== 'PERCENT_OF_DIRECT' && Number(l.unitCost.toString()) <= 0) {
        console.log(`  ${v.formula.code}: ${l.nameAr}`);
        unpriced += 1;
      }
    }
  }
  if (unpriced === 0) console.log('  لا شيء.');
  console.log(`\n${results.length} تغييراً · ${unpriced} بنداً بلا سعر`);
  console.log('المسودات تنتظر مراجعة المدير ونشره. لا تكلفة محسوبة سابقاً تغيّرت.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
