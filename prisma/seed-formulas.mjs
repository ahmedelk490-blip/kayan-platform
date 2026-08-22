// معادلتا التكلفة (طباعة DTF + تطريز) كبيانات قابلة للتعديل من شاشة المعادلات.
// كل رقم (سعر الرول، عدد علب الحبر، الكمية الناتجة، سعر العلبة) يُعدَّل من
// الواجهة — المحرّك يحسب التكلفة/القطعة من هذه البنود بلا أي كود.
//
// idempotent: يتخطّى المعادلة إن كانت موجودة بنفس الاسم.
// التشغيل:  DATABASE_URL="mysql://..." node prisma/seed-formulas.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FORMULAS = [
  {
    nameAr: 'طباعة DTF — التكلفة القياسية',
    kind: 'PRINTING',
    notes: 'الرول الواحد ينتج 100 قطعة. عدّل سعر الرول أو عدد علب الحبر أو الكمية الناتجة وستتغيّر التكلفة تلقائياً.',
    lines: [
      { category: 'MATERIAL', nameAr: 'فيلم الرول (DTF)', basis: 'PER_YIELD', quantity: 1, yieldQty: 100, unitCost: 100000, unit: 'رول' },
      { category: 'INK', nameAr: 'حبر أبيض', basis: 'PER_YIELD', quantity: 4, yieldQty: 100, unitCost: 65000, unit: 'علبة' },
      { category: 'INK', nameAr: 'حبر أصفر', basis: 'PER_YIELD', quantity: 3, yieldQty: 100, unitCost: 65000, unit: 'علبة' },
      { category: 'INK', nameAr: 'حبر أحمر', basis: 'PER_YIELD', quantity: 0.5, yieldQty: 100, unitCost: 65000, unit: 'علبة' },
      { category: 'INK', nameAr: 'حبر أزرق', basis: 'PER_YIELD', quantity: 0.5, yieldQty: 100, unitCost: 65000, unit: 'علبة' },
      { category: 'INK', nameAr: 'حبر أسود', basis: 'PER_YIELD', quantity: 0.5, yieldQty: 100, unitCost: 65000, unit: 'علبة' },
    ],
  },
  {
    nameAr: 'تطريز — التكلفة القياسية',
    kind: 'EMBROIDERY',
    notes: 'تكلفة الخيط لكل قطعة. عدّلها حسب الحاجة، وأضِف بنوداً للأجرة أو الوقت.',
    lines: [
      { category: 'THREAD', nameAr: 'خيط التطريز', basis: 'PER_PIECE', quantity: 1, yieldQty: null, unitCost: 2000, unit: 'قطعة' },
    ],
  },
];

async function nextCode(tenantId) {
  const rows = await prisma.formula.findMany({ where: { tenantId }, select: { code: true } });
  const max = rows.reduce((a, r) => {
    const n = Number.parseInt(String(r.code).replace('FRM-', ''), 10);
    return Number.isFinite(n) && n > a ? n : a;
  }, 0);
  return `FRM-${String(max + 1).padStart(4, '0')}`;
}

async function run() {
  const anyProduct = await prisma.product.findFirst({ select: { tenantId: true } });
  if (!anyProduct) throw new Error('لا يوجد مستأجر (منتجات) لربط المعادلات به.');
  const tenantId = anyProduct.tenantId;

  for (const f of FORMULAS) {
    const existing = await prisma.formula.findFirst({
      where: { tenantId, nameAr: f.nameAr, isDeleted: false },
    });
    if (existing) {
      console.log(`  تخطّي «${f.nameAr}» — موجودة سلفاً`);
      continue;
    }
    const code = await nextCode(tenantId);
    await prisma.formula.create({
      data: {
        tenantId,
        code,
        nameAr: f.nameAr,
        kind: f.kind,
        notes: f.notes,
        versions: {
          create: {
            version: 1,
            status: 'DRAFT',
            lines: {
              create: f.lines.map((l, i) => ({
                sequence: i + 1,
                category: l.category,
                nameAr: l.nameAr,
                basis: l.basis,
                quantity: l.quantity,
                yieldQty: l.yieldQty ?? null,
                unitCost: l.unitCost,
                unit: l.unit ?? null,
              })),
            },
          },
        },
      },
    });
    console.log(`  ✓ «${f.nameAr}» (${code}) — ${f.lines.length} بند قابل للتعديل`);
  }
  console.log('\nتم. افتح: المخزون ← المعادلات والتكلفة، وعدّل أي رقم.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
