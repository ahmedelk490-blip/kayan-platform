// تهيئة المنتجات الحقيقية: أسعار (حسب الخدمة والكمية) + ألوان + مقاسات.
// idempotent — يُعاد تشغيله بأمان: يستبدل الشرائح ويتخطّى المتغيّرات الموجودة.
//
// التشغيل:  DATABASE_URL="mysql://..." node prisma/seed-catalog.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// الأسعار بالدينار العراقي (١٨ = ١٨٬٠٠٠). الشريحة بلا حدٍّ أعلى = جملة (٦ فأكثر).
const CONFIG = [
  {
    skus: ['VEST-TURKISH-001', 'VEST-TURKISH-002'],
    tiers: [
      { service: 'EMBROIDERY', minQty: 1, maxQty: null, price: 18000 },
      { service: 'DTF', minQty: 1, maxQty: null, price: 16000 },
    ],
  },
  {
    skus: ['TSHIRTS-001', 'TSHIRTS-002'],
    tiers: [
      { service: 'EMBROIDERY', minQty: 1, maxQty: 5, price: 18000 },
      { service: 'EMBROIDERY', minQty: 6, maxQty: null, price: 17000 },
      { service: 'DTF', minQty: 1, maxQty: 5, price: 16000 },
      { service: 'DTF', minQty: 6, maxQty: null, price: 15000 },
    ],
  },
  {
    skus: ['VEST-CHINESE-001'],
    tiers: [
      { service: 'EMBROIDERY', minQty: 1, maxQty: 5, price: 19000 },
      { service: 'EMBROIDERY', minQty: 6, maxQty: null, price: 17000 },
      { service: 'DTF', minQty: 1, maxQty: 5, price: 16000 },
      { service: 'DTF', minQty: 6, maxQty: null, price: 15000 },
    ],
  },
];

const COLOR_NAMES = ['أسود', 'أبيض', 'كحلي', 'رمادي'];
const SIZE_CODES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

// تكلفة مواد الطباعة DTF للقطعة الواحدة (الرول = ١٠٠ قطعة):
//   فيلم الرول ١٠٠٬٠٠٠ ÷ ١٠٠ = ١٬٠٠٠
//   حبر: ٤ أبيض + ٣ أصفر + ٠٫٥ أحمر + ٠٫٥ أزرق + ٠٫٥ أسود = ٨٫٥ علبة × ٦٥٬٠٠٠ ÷ ١٠٠ = ٥٬٥٢٥
// = ٦٬٥٢٥ د.ع مواد فقط (لا تشمل القماش الخام ولا الأجرة — تُضاف حين تُحدَّد).
const ROLL_PRICE = 100000;
const PIECES_PER_ROLL = 100;
const INK_BOX_PRICE = 65000;
const INK_BOXES_PER_ROLL = 4 + 3 + 0.5 + 0.5 + 0.5; // أبيض/أصفر/أحمر/أزرق/أسود
const DTF_MATERIAL_COST = Math.round(
  ROLL_PRICE / PIECES_PER_ROLL + (INK_BOXES_PER_ROLL * INK_BOX_PRICE) / PIECES_PER_ROLL,
);

const colorSku = (c) => (c.nameEn || c.id.slice(-4)).replace(/\s+/g, '-').toUpperCase();

async function run() {
  let tiersSet = 0;
  let variantsAdded = 0;

  for (const cfg of CONFIG) {
    for (const sku of cfg.skus) {
      const product = await prisma.product.findFirst({ where: { sku, isDeleted: false } });
      if (!product) {
        console.log(`  تخطّي ${sku} — غير موجود`);
        continue;
      }
      const tenantId = product.tenantId;

      // التكلفة (مواد الطباعة للقطعة). تُخزَّن للربحية وقابلة للتعديل لاحقاً.
      await prisma.product.update({
        where: { id: product.id },
        data: { cost: DTF_MATERIAL_COST },
      });

      // الشرائح: احذف القديمة للمنتج (بلا متغيّر) وأنشئ الجديدة.
      await prisma.priceTier.deleteMany({ where: { productId: product.id, variantId: null } });
      await prisma.priceTier.createMany({
        data: cfg.tiers.map((t) => ({
          tenantId,
          productId: product.id,
          variantId: null,
          service: t.service,
          minQty: t.minQty,
          maxQty: t.maxQty,
          price: t.price,
        })),
      });
      tiersSet += cfg.tiers.length;

      // الألوان والمقاسات.
      const [colors, sizes, warehouse] = await Promise.all([
        prisma.color.findMany({ where: { tenantId, isDeleted: false, nameAr: { in: COLOR_NAMES } } }),
        prisma.size.findMany({ where: { tenantId, isDeleted: false, code: { in: SIZE_CODES } } }),
        prisma.warehouse.findFirst({ where: { tenantId, isDeleted: false }, orderBy: { createdAt: 'asc' } }),
      ]);

      for (const color of colors) {
        for (const size of sizes) {
          const exists = await prisma.productVariant.findFirst({
            where: { productId: product.id, colorId: color.id, sizeId: size.id },
          });
          if (exists) continue;
          const v = await prisma.productVariant.create({
            data: {
              productId: product.id,
              sku: `${product.sku}-${colorSku(color)}-${size.code}`,
              colorId: color.id,
              sizeId: size.id,
            },
          });
          if (warehouse) {
            await prisma.stock.create({ data: { variantId: v.id, warehouseId: warehouse.id } });
          }
          variantsAdded += 1;
        }
      }

      // عطّل المتغيّر الافتراضي (بلا لون/مقاس) بعد وجود متغيّرات حقيقية، فلا
      // يظهر خيار "بلا لون" في الفاتورة.
      if (colors.length > 0 && sizes.length > 0) {
        await prisma.productVariant.updateMany({
          where: { productId: product.id, colorId: null, sizeId: null, isDeleted: false },
          data: { isActive: false },
        });
      }

      console.log(`  ✓ ${sku} — ${cfg.tiers.length} شريحة، ${colors.length}×${sizes.length} لون/مقاس`);
    }
  }

  console.log(`\nتم: ${tiersSet} شريحة سعر، ${variantsAdded} متغيّر جديد.`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
