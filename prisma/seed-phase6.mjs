/**
 * Phase 6 seed — two example formulas, published, with PLACEHOLDER numbers.
 *
 * ⚠ Every rate and quantity below is a placeholder for the manager to
 * replace with KAYAN's real figures. They are shaped correctly (a roll does
 * yield a few hundred shirts; setup time is charged once) so the engine can
 * be exercised end to end, but nobody measured them. The formula notes say
 * so in the UI too, so a number is never mistaken for a fact.
 *
 * Idempotent: re-running updates nothing that already exists.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  // Tooling spans tenants, so it uses the maintenance connection. The
  // application role deliberately cannot see anything without a tenant.
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});
const T = 'kayan';

const PLACEHOLDER =
  '⚠ الأرقام الحالية قيم مبدئية للتجربة فقط — يجب أن يستبدلها المدير بأرقام كيان الفعلية.';

/** @type {{code:string,nameAr:string,kind:string,params:object[],lines:object[]}[]} */
const FORMULAS = [
  {
    code: 'FRM-0001',
    nameAr: 'طباعة سيلك سكرين — تيشيرت',
    kind: 'PRINTING',
    params: [
      { key: 'minutesPerPiece', nameAr: 'دقائق التشغيل للقطعة', value: 0.4, unit: 'دقيقة' },
      { key: 'setupMinutes', nameAr: 'دقائق التجهيز للأمر', value: 30, unit: 'دقيقة' },
    ],
    lines: [
      {
        category: 'MATERIAL',
        nameAr: 'قماش قطن ١٨٠ جم',
        basis: 'PER_PIECE',
        quantity: 1.5,
        unit: 'متر',
        unitCost: 45,
      },
      {
        // A roll priced per gram, yielding a known number of pieces — this is
        // exactly what PER_YIELD exists for.
        category: 'INK',
        nameAr: 'حبر أبيض (بلاستيزول)',
        basis: 'PER_YIELD',
        quantity: 1000,
        yieldQty: 400,
        unit: 'جرام',
        unitCost: 0.35,
      },
      {
        category: 'INK',
        nameAr: 'أحبار ملوّنة',
        basis: 'PER_YIELD',
        quantity: 600,
        yieldQty: 400,
        unit: 'جرام',
        unitCost: 0.4,
      },
      {
        // Charged once per order, not per piece — which is why a long run
        // costs less per shirt than a short one.
        category: 'MACHINE',
        nameAr: 'تجهيز الشاشات',
        basis: 'PER_ORDER',
        quantity: 1,
        unit: 'تجهيز',
        unitCost: 120,
      },
      {
        category: 'LABOR',
        nameAr: 'أجر الطباعة',
        basis: 'PER_MINUTE',
        quantity: 1,
        unit: 'دقيقة',
        unitCost: 1.5,
      },
      {
        category: 'PACKAGING',
        nameAr: 'كيس تغليف وملصق',
        basis: 'PER_PIECE',
        quantity: 1,
        unit: 'كيس',
        unitCost: 1.25,
      },
      {
        category: 'WASTE',
        nameAr: 'نسبة هالك',
        basis: 'PERCENT_OF_DIRECT',
        quantity: 3,
        unitCost: 0,
      },
      {
        category: 'OVERHEAD',
        nameAr: 'مصاريف غير مباشرة',
        basis: 'PERCENT_OF_DIRECT',
        quantity: 7,
        unitCost: 0,
      },
    ],
  },
  {
    code: 'FRM-0002',
    nameAr: 'تطريز صدر — شعار',
    kind: 'EMBROIDERY',
    params: [
      { key: 'stitchCount', nameAr: 'عدد الغرز للقطعة', value: 8000, unit: 'غرزة' },
      { key: 'stitchesPerMinute', nameAr: 'سرعة الماكينة', value: 700, unit: 'غرزة/دقيقة' },
      { key: 'setupMinutes', nameAr: 'دقائق التجهيز للأمر', value: 20, unit: 'دقيقة' },
    ],
    lines: [
      {
        category: 'THREAD',
        nameAr: 'خيط بوليستر',
        basis: 'PER_1000_STITCHES',
        quantity: 1.2,
        unit: 'جرام',
        unitCost: 0.28,
      },
      {
        category: 'MATERIAL',
        nameAr: 'ورق باكينج',
        basis: 'PER_PIECE',
        quantity: 1,
        unit: 'ورقة',
        unitCost: 0.6,
      },
      {
        // Machine time is derived from stitch count ÷ speed, plus setup.
        category: 'MACHINE',
        nameAr: 'تشغيل ماكينة التطريز',
        basis: 'PER_MINUTE',
        quantity: 1,
        unit: 'دقيقة',
        unitCost: 2,
      },
      {
        category: 'LABOR',
        nameAr: 'أجر المشغّل',
        basis: 'PER_MINUTE',
        quantity: 1,
        unit: 'دقيقة',
        unitCost: 1.1,
      },
      {
        category: 'WASTE',
        nameAr: 'نسبة هالك',
        basis: 'PERCENT_OF_DIRECT',
        quantity: 2.5,
        unitCost: 0,
      },
    ],
  },
];

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: 'manager@kayan.eg' } });

  for (const spec of FORMULAS) {
    const existing = await prisma.formula.findFirst({
      where: { tenantId: T, code: spec.code },
    });
    if (existing) {
      console.log(`skip ${spec.code} — already exists`);
      continue;
    }

    const formula = await prisma.formula.create({
      data: {
        tenantId: T,
        code: spec.code,
        nameAr: spec.nameAr,
        kind: spec.kind,
        notes: PLACEHOLDER,
        versions: {
          create: {
            version: 1,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            publishedById: admin?.id ?? null,
            notes: PLACEHOLDER,
            params: { create: spec.params },
            lines: {
              create: spec.lines.map((l, i) => ({
                sequence: i + 1,
                category: l.category,
                nameAr: l.nameAr,
                basis: l.basis,
                quantity: l.quantity,
                yieldQty: l.yieldQty ?? null,
                unit: l.unit ?? null,
                unitCost: l.unitCost,
              })),
            },
          },
        },
      },
      include: { versions: true },
    });

    await prisma.formula.update({
      where: { id: formula.id },
      data: { currentVersionId: formula.versions[0].id },
    });

    console.log(`created ${spec.code} — ${spec.nameAr} (${spec.lines.length} lines, published v1)`);
  }

  // Assign the printing formula to the first active product, for every
  // variant, so there is something costable to demonstrate.
  const printing = await prisma.formula.findFirst({ where: { tenantId: T, code: 'FRM-0001' } });
  const product = await prisma.product.findFirst({
    where: { tenantId: T, isDeleted: false, status: 'ACTIVE' },
    orderBy: { sku: 'asc' },
  });

  if (printing && product) {
    const existing = await prisma.productFormula.findFirst({
      where: { productId: product.id, variantId: null, formulaId: printing.id },
    });
    if (existing) {
      console.log(`skip assignment — ${printing.code} already on ${product.sku}`);
    } else {
      await prisma.productFormula.create({
        data: { productId: product.id, variantId: null, formulaId: printing.id },
      });
      console.log(`assigned ${printing.code} -> ${product.sku} (all variants)`);
    }
  }

  console.log('\n⚠ every number seeded here is a PLACEHOLDER. Edit before use.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
