/**
 * Phase 3 seed — lookup data only.
 *
 * Colours, sizes, materials, decoration options and one warehouse. These are
 * the vocabularies the catalogue is built from; without them a variant cannot
 * be created at all.
 *
 * Idempotent: every write is an upsert keyed on a natural unique constraint.
 * Phase 2's seed (roles, permissions, users) is frozen and not touched here.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT = 'kayan';

const COLORS = [
  { nameAr: 'أسود', nameEn: 'Black', hex: '#111111' },
  { nameAr: 'أبيض', nameEn: 'White', hex: '#FFFFFF' },
  { nameAr: 'كحلي', nameEn: 'Navy', hex: '#1B2A4A' },
  { nameAr: 'رمادي', nameEn: 'Grey', hex: '#8A8A8A' },
  { nameAr: 'نبيتي', nameEn: 'Maroon', hex: '#5C2535' },
  { nameAr: 'أحمر', nameEn: 'Red', hex: '#C1272D' },
  { nameAr: 'أخضر', nameEn: 'Green', hex: '#1E7A46' },
  { nameAr: 'برتقالي عاكس', nameEn: 'Hi-Vis Orange', hex: '#FF6A13' },
  { nameAr: 'أصفر عاكس', nameEn: 'Hi-Vis Yellow', hex: '#E4E829' },
  { nameAr: 'بيج', nameEn: 'Beige', hex: '#D8C7A9' },
];

/** sortOrder matters: alphabetical puts XL before XS. */
const SIZES = [
  { code: 'S', nameAr: 'سمول' },
  { code: 'M', nameAr: 'ميديم' },
  { code: 'L', nameAr: 'لارج' },
  { code: 'XL', nameAr: 'إكس لارج' },
  { code: '2XL', nameAr: '٢ إكس لارج' },
  { code: '3XL', nameAr: '٣ إكس لارج' },
  { code: '4XL', nameAr: '٤ إكس لارج' },
];

const MATERIALS = [
  { nameAr: 'قطن ١٨٠ جرام', nameEn: 'Cotton 180gsm', spec: '100% قطن مفرز' },
  { nameAr: 'قطن ٢٢٠ جرام', nameEn: 'Cotton 220gsm', spec: '100% قطن مفرز' },
  { nameAr: 'بولي كوتون', nameEn: 'Poly-Cotton', spec: '65% بوليستر / 35% قطن' },
  { nameAr: 'بوليستر', nameEn: 'Polyester', spec: '100% بوليستر' },
  { nameAr: 'تويل', nameEn: 'Twill', spec: 'قماش تويل للمرايل وملابس العمل' },
  { nameAr: 'جبردين', nameEn: 'Gabardine', spec: 'للزي الإداري وملابس العمل' },
];

const PRINTING = [
  { nameAr: 'سلك سكرين', nameEn: 'Silk Screen', notes: 'الأنسب للكميات الكبيرة' },
  { nameAr: 'طباعة DTF', nameEn: 'DTF', notes: 'تصاميم متعددة الألوان' },
  { nameAr: 'طباعة حرارية', nameEn: 'Heat Transfer', notes: 'الكميات الصغيرة والعينات' },
  { nameAr: 'تسامي', nameEn: 'Sublimation', notes: 'للأقمشة البوليستر الفاتحة' },
  { nameAr: 'فينيل', nameEn: 'Vinyl', notes: 'أرقام وأسماء' },
];

const EMBROIDERY = [
  { nameAr: 'تطريز مسطح', nameEn: 'Flat Embroidery', notes: 'الشعارات والنصوص' },
  { nameAr: 'تطريز بارز 3D', nameEn: '3D Puff', notes: 'القبعات غالباً' },
  { nameAr: 'تطريز شنيل', nameEn: 'Chenille', notes: 'الجاكيتات' },
];

async function main() {
  let n = { colors: 0, sizes: 0, materials: 0, printing: 0, embroidery: 0, warehouses: 0, locations: 0 };

  for (const [i, c] of COLORS.entries()) {
    await prisma.color.upsert({
      where: { tenantId_nameAr: { tenantId: TENANT, nameAr: c.nameAr } },
      update: { nameEn: c.nameEn, hex: c.hex, sortOrder: i },
      create: { tenantId: TENANT, ...c, sortOrder: i },
    });
    n.colors += 1;
  }

  for (const [i, s] of SIZES.entries()) {
    await prisma.size.upsert({
      where: { tenantId_code: { tenantId: TENANT, code: s.code } },
      update: { nameAr: s.nameAr, sortOrder: i },
      create: { tenantId: TENANT, ...s, sortOrder: i },
    });
    n.sizes += 1;
  }

  for (const m of MATERIALS) {
    await prisma.material.upsert({
      where: { tenantId_nameAr: { tenantId: TENANT, nameAr: m.nameAr } },
      update: { nameEn: m.nameEn, spec: m.spec },
      create: { tenantId: TENANT, ...m },
    });
    n.materials += 1;
  }

  for (const p of PRINTING) {
    await prisma.printingOption.upsert({
      where: { tenantId_nameAr: { tenantId: TENANT, nameAr: p.nameAr } },
      update: { nameEn: p.nameEn, notes: p.notes },
      create: { tenantId: TENANT, ...p },
    });
    n.printing += 1;
  }

  for (const e of EMBROIDERY) {
    await prisma.embroideryOption.upsert({
      where: { tenantId_nameAr: { tenantId: TENANT, nameAr: e.nameAr } },
      update: { nameEn: e.nameEn, notes: e.notes },
      create: { tenantId: TENANT, ...e },
    });
    n.embroidery += 1;
  }

  const warehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: TENANT, code: 'WH-MAIN' } },
    update: { nameAr: 'المخزن الرئيسي' },
    create: { tenantId: TENANT, code: 'WH-MAIN', nameAr: 'المخزن الرئيسي' },
  });
  n.warehouses = 1;

  for (const code of ['A-01', 'A-02', 'B-01', 'B-02']) {
    await prisma.warehouseLocation.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code } },
      update: {},
      create: { warehouseId: warehouse.id, code, nameAr: `رف ${code}` },
    });
    n.locations += 1;
  }

  console.log('lookup seed:', n);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
