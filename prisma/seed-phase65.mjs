/**
 * Phase 6.5 seed — the REAL KAYAN printing formula, plus supplies.
 *
 * ── What is real here and what is not ───────────────────────
 *
 * REAL — supplied by the business, seeded exactly:
 *   1 printing roll = 100 metres
 *   Ink per roll: white 4 bottles, yellow 3, red 0.5, blue 0.5, black 0.5
 *   Output per roll: 500 t-shirts / vests · 500 large aprons · 4000 caps
 *
 * NOT SUPPLIED — every PRICE. Cost per metre of roll and cost per bottle of
 * ink were not given, so they are seeded as 0 and must be entered by the
 * manager. They are NOT guessed: a plausible invented price produces a
 * confident wrong cost, which is worse than an obvious zero. The formula
 * pages flag every zero-priced line.
 *
 * Because output per roll differs by product type, this is three formulas,
 * not one. The consumption is identical; only the yield changes.
 *
 * Idempotent: re-running skips what already exists.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  // Tooling spans tenants, so it uses the maintenance connection. The
  // application role deliberately cannot see anything without a tenant.
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});
const T = 'kayan';

const ROLL_METRES = 100;

/** Bottles consumed per whole roll. Real figures. */
const INKS = [
  { nameAr: 'حبر أبيض', bottles: 4 },
  { nameAr: 'حبر أصفر', bottles: 3 },
  { nameAr: 'حبر أحمر', bottles: 0.5 },
  { nameAr: 'حبر أزرق', bottles: 0.5 },
  { nameAr: 'حبر أسود', bottles: 0.5 },
];

/** Pieces produced by one roll, per product type. Real figures. */
const VARIANTS = [
  { code: 'FRM-PRINT-TSHIRT', nameAr: 'طباعة رول — تيشيرت ويلك', yieldQty: 500 },
  { code: 'FRM-PRINT-APRON', nameAr: 'طباعة رول — مريلة كبيرة', yieldQty: 500 },
  { code: 'FRM-PRINT-CAP', nameAr: 'طباعة رول — قبعات', yieldQty: 4000 },
];

const PRICES_MISSING =
  '⚠ الاستهلاك حقيقي ومعتمد من الإدارة. الأسعار (تكلفة المتر وتكلفة الزجاجة) لم تُزوَّد بعد ' +
  'وقيمتها صفر — يجب إدخالها قبل استخدام هذه المعادلة في أي تسعير.';

/** Consumables the printing and embroidery departments actually buy. */
const SUPPLIES = [
  { code: 'SUP-P-001', nameAr: 'رول طباعة ١٠٠ متر', kind: 'PRINTING', category: 'ROLL', unit: 'رول' },
  { code: 'SUP-P-002', nameAr: 'حبر أبيض', kind: 'PRINTING', category: 'INK', unit: 'زجاجة' },
  { code: 'SUP-P-003', nameAr: 'حبر أصفر', kind: 'PRINTING', category: 'INK', unit: 'زجاجة' },
  { code: 'SUP-P-004', nameAr: 'حبر أحمر', kind: 'PRINTING', category: 'INK', unit: 'زجاجة' },
  { code: 'SUP-P-005', nameAr: 'حبر أزرق', kind: 'PRINTING', category: 'INK', unit: 'زجاجة' },
  { code: 'SUP-P-006', nameAr: 'حبر أسود', kind: 'PRINTING', category: 'INK', unit: 'زجاجة' },
  { code: 'SUP-P-007', nameAr: 'محلول تنظيف', kind: 'PRINTING', category: 'CLEANING', unit: 'لتر' },
  { code: 'SUP-P-008', nameAr: 'ورق حراري / ترانسفير', kind: 'PRINTING', category: 'TRANSFER_PAPER', unit: 'فرخ' },
  { code: 'SUP-E-001', nameAr: 'خيط تطريز بوليستر', kind: 'EMBROIDERY', category: 'THREAD', unit: 'بكرة' },
  { code: 'SUP-E-002', nameAr: 'إبر ماكينة تطريز', kind: 'EMBROIDERY', category: 'NEEDLE', unit: 'إبرة' },
  { code: 'SUP-E-003', nameAr: 'فرايم / إطارات', kind: 'EMBROIDERY', category: 'FRAME', unit: 'قطعة' },
  { code: 'SUP-E-004', nameAr: 'باكينج / مثبّت', kind: 'EMBROIDERY', category: 'BACKING', unit: 'متر' },
];

function linesFor(yieldQty) {
  const lines = [
    {
      sequence: 1,
      category: 'MATERIAL',
      nameAr: `رول طباعة (${ROLL_METRES} متر)`,
      basis: 'PER_YIELD',
      quantity: ROLL_METRES,
      yieldQty,
      unit: 'متر',
      unitCost: 0,
      notes: 'تكلفة المتر لم تُزوَّد — أدخِلها قبل الاستخدام.',
    },
  ];

  INKS.forEach((ink, i) => {
    lines.push({
      sequence: i + 2,
      category: 'INK',
      nameAr: ink.nameAr,
      basis: 'PER_YIELD',
      quantity: ink.bottles,
      yieldQty,
      unit: 'زجاجة',
      unitCost: 0,
      notes: 'تكلفة الزجاجة لم تُزوَّد — أدخِلها قبل الاستخدام.',
    });
  });

  return lines;
}

async function main() {
  const manager = await prisma.user.findFirst({ where: { email: 'manager@kayan.eg' } });

  for (const spec of VARIANTS) {
    const existing = await prisma.formula.findFirst({ where: { tenantId: T, code: spec.code } });
    if (existing) {
      console.log(`skip ${spec.code} — already exists`);
      continue;
    }

    const lines = linesFor(spec.yieldQty);
    const formula = await prisma.formula.create({
      data: {
        tenantId: T,
        code: spec.code,
        nameAr: spec.nameAr,
        kind: 'PRINTING',
        notes: PRICES_MISSING,
        versions: {
          create: {
            version: 1,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            publishedById: manager?.id ?? null,
            notes: `رول ${ROLL_METRES} متر ← ${spec.yieldQty} قطعة. ${PRICES_MISSING}`,
            lines: { create: lines },
          },
        },
      },
      include: { versions: true },
    });

    await prisma.formula.update({
      where: { id: formula.id },
      data: { currentVersionId: formula.versions[0].id },
    });

    console.log(
      `created ${spec.code} — رول ${ROLL_METRES}م ← ${spec.yieldQty} قطعة (${lines.length} بنود)`,
    );
  }

  // Supplies master.
  let added = 0;
  for (const s of SUPPLIES) {
    const existing = await prisma.supply.findFirst({ where: { tenantId: T, code: s.code } });
    if (existing) continue;
    await prisma.supply.create({ data: { tenantId: T, ...s } });
    added += 1;
  }
  console.log(`supplies: ${added} added, ${SUPPLIES.length - added} already present`);

  console.log('\n⚠ الاستهلاك حقيقي. الأسعار صفر ولم تُزوَّد — أدخِلها قبل أي تسعير.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
