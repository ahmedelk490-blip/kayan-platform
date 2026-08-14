/**
 * أسعار البيع المعلنة من الإدارة — إدخال أوّلي قابل للتعديل.
 *
 * الأرقام كما أرسلتها الإدارة (بالألف دينار عراقي):
 *
 *   يلك تركي        تطريز 18   ·  DTF 16
 *   تيشيرت صيفي     تطريز 17 (≥6) / 18 (<6)  ·  DTF 15 (≥6) / 16 (<6)
 *   يلك كتان صيني   تطريز 17 (≥6) / 19 (<6)  ·  DTF 15 (≥6) / 16 (<6)
 *
 * ⚠ اليلك التركي لم تُذكر له أسعار الكميات الصغيرة، فلم تُخترع. تظهر
 *   كفجوة تغطية في الشاشة حتى تُدخلها الإدارة.
 *
 * كل شريحة صف قابل للتعديل والحذف من الشاشة. لا سعر في الكود.
 * إعادة التشغيل تُحدِّث ولا تُكرِّر — المفتاح فريد على قاعدة البيانات.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const T = 'kayan';
const K = 1000; // الأرقام معلنة بالألف

/** يُطابق بالـ SKU حين يوجد، وإلا بجزء من الاسم العربي. */
const CATALOG = [
  {
    match: { skuLike: 'VEST-TURKISH', nameLike: 'تركي' },
    label: 'يلك تركي',
    tiers: [
      { service: 'EMBROIDERY', minQty: 6, maxQty: null, price: 18 * K },
      { service: 'DTF', minQty: 6, maxQty: null, price: 16 * K },
    ],
  },
  {
    match: { skuLike: 'TSHIRTS-001', nameLike: 'تيشيرت' },
    label: 'تيشيرت صيفي',
    tiers: [
      { service: 'EMBROIDERY', minQty: 1, maxQty: 5, price: 18 * K },
      { service: 'EMBROIDERY', minQty: 6, maxQty: null, price: 17 * K },
      { service: 'DTF', minQty: 1, maxQty: 5, price: 16 * K },
      { service: 'DTF', minQty: 6, maxQty: null, price: 15 * K },
    ],
  },
  {
    match: { skuLike: 'VEST-CHINESE', nameLike: 'صيني' },
    label: 'يلك كتان صيني',
    tiers: [
      { service: 'EMBROIDERY', minQty: 1, maxQty: 5, price: 19 * K },
      { service: 'EMBROIDERY', minQty: 6, maxQty: null, price: 17 * K },
      { service: 'DTF', minQty: 1, maxQty: 5, price: 16 * K },
      { service: 'DTF', minQty: 6, maxQty: null, price: 15 * K },
    ],
  },
];

async function main() {
  const products = await prisma.product.findMany({
    where: { tenantId: T, isDeleted: false },
    select: { id: true, sku: true, nameAr: true },
  });

  let written = 0;
  const unmatched = [];

  for (const entry of CATALOG) {
    const product =
      products.find((p) => p.sku.toUpperCase().includes(entry.match.skuLike)) ??
      products.find((p) => p.nameAr.includes(entry.match.nameLike));

    if (!product) {
      unmatched.push(entry.label);
      continue;
    }

    for (const t of entry.tiers) {
      // ليس upsert: Prisma لا يقبل null داخل مفتاح مركّب في where، وشرائح
      // المنتج كله variantId فيها فارغ. البحث ثم الكتابة يؤدّي الغرض،
      // والقيد الفريد على قاعدة البيانات هو ما يمنع التكرار فعلاً.
      const existing = await prisma.priceTier.findFirst({
        where: {
          productId: product.id,
          variantId: null,
          service: t.service,
          minQty: t.minQty,
        },
        select: { id: true },
      });

      if (existing) {
        // التحديث لا يمسّ notes: قد يكون المدير كتب فيها شيئاً.
        await prisma.priceTier.update({
          where: { id: existing.id },
          data: { maxQty: t.maxQty, price: t.price.toFixed(4), isActive: true },
        });
      } else {
        await prisma.priceTier.create({
          data: {
            tenantId: T,
            productId: product.id,
            variantId: null,
            service: t.service,
            minQty: t.minQty,
            maxQty: t.maxQty,
            price: t.price.toFixed(4),
            currency: 'IQD',
            notes: 'سعر معلن من الإدارة — قابل للتعديل.',
          },
        });
      }
      written += 1;
    }
    console.log(`${entry.label} ← ${product.sku} · ${entry.tiers.length} شريحة`);
  }

  if (unmatched.length) {
    console.log('\n⚠ لم يُعثر على منتج مطابق، ولم يُخترع:');
    for (const u of unmatched) console.log(`   ${u}`);
  }

  console.log(`\n${written} شريحة سعر.`);
  console.log('اليلك التركي بلا أسعار للكميات الصغيرة — لم تُرسل ولم تُخترع.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
