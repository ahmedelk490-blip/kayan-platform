'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

export interface SeedState {
  ok?: string;
  error?: string;
}

// ── بيانات المنتجات (نفس سكربت seed-catalog) ────────────────
const CATALOG = [
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
// تكلفة مواد DTF/قطعة: فيلم 100000÷100 + حبر 8.5×65000÷100 = 6525.
const DTF_MATERIAL_COST = Math.round(100000 / 100 + (8.5 * 65000) / 100);

const FORMULAS = [
  {
    nameAr: 'طباعة DTF — التكلفة القياسية',
    kind: 'PRINTING',
    notes: 'الرول الواحد ينتج 100 قطعة. عدّل أي رقم وتتغيّر التكلفة تلقائياً.',
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
    notes: 'تكلفة الخيط لكل قطعة. عدّلها وأضِف بنوداً للأجرة أو الوقت.',
    lines: [
      { category: 'THREAD', nameAr: 'خيط التطريز', basis: 'PER_PIECE', quantity: 1, yieldQty: null, unitCost: 2000, unit: 'قطعة' },
    ],
  },
];

const colorSku = (c: { nameEn: string | null; id: string }) =>
  (c.nameEn || c.id.slice(-4)).replace(/\s+/g, '-').toUpperCase();

/**
 * تهيئة الأسعار والألوان والمقاسات والمعادلات على قاعدة البيانات الحيّة.
 *
 * يُشغَّل داخل التطبيق (له وصول لقاعدة البيانات) بدل SSH الذي يقطعه المضيف.
 * idempotent — يُعاد تشغيله بأمان: يستبدل الشرائح ويتخطّى الموجود.
 */
export async function seedCatalogAndFormulas(): Promise<SeedState> {
  const user = await requirePermission('products.write');
  const tenantId = user.tenantId;

  let tiers = 0;
  let variants = 0;
  let formulas = 0;

  try {
    const warehouse = await prisma.warehouse.findFirst({
      where: { tenantId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    for (const cfg of CATALOG) {
      for (const sku of cfg.skus) {
        const product = await prisma.product.findFirst({ where: { tenantId, sku, isDeleted: false } });
        if (!product) continue;

        await prisma.product.update({ where: { id: product.id }, data: { cost: DTF_MATERIAL_COST } });

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
        tiers += cfg.tiers.length;

        const [colors, sizes] = await Promise.all([
          prisma.color.findMany({ where: { tenantId, isDeleted: false, nameAr: { in: COLOR_NAMES } }, select: { id: true, nameEn: true } }),
          prisma.size.findMany({ where: { tenantId, isDeleted: false, code: { in: SIZE_CODES } }, select: { id: true, code: true } }),
        ]);

        for (const color of colors) {
          for (const size of sizes) {
            const exists = await prisma.productVariant.findFirst({
              where: { productId: product.id, colorId: color.id, sizeId: size.id },
              select: { id: true },
            });
            if (exists) continue;
            const v = await prisma.productVariant.create({
              data: { productId: product.id, sku: `${product.sku}-${colorSku(color)}-${size.code}`, colorId: color.id, sizeId: size.id },
            });
            if (warehouse) await prisma.stock.create({ data: { variantId: v.id, warehouseId: warehouse.id } });
            variants += 1;
          }
        }

        if (colors.length > 0 && sizes.length > 0) {
          await prisma.productVariant.updateMany({
            where: { productId: product.id, colorId: null, sizeId: null, isDeleted: false },
            data: { isActive: false },
          });
        }
      }
    }

    // المعادلات.
    const codeRows = await prisma.formula.findMany({ where: { tenantId }, select: { code: true } });
    let maxCode = codeRows.reduce((a, r) => {
      const n = Number.parseInt(String(r.code).replace('FRM-', ''), 10);
      return Number.isFinite(n) && n > a ? n : a;
    }, 0);

    for (const f of FORMULAS) {
      const existing = await prisma.formula.findFirst({ where: { tenantId, nameAr: f.nameAr, isDeleted: false } });
      if (existing) continue;
      maxCode += 1;
      await prisma.formula.create({
        data: {
          tenantId,
          code: `FRM-${String(maxCode).padStart(4, '0')}`,
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
      formulas += 1;
    }

    await audit({
      tenantId,
      userId: user.id,
      action: 'catalog.seed',
      entityType: 'Tenant',
      entityId: tenantId,
      detail: `${tiers} شريحة، ${variants} متغيّر، ${formulas} معادلة`,
    });

    revalidatePath('/catalog/products');
    revalidatePath('/invoices');
    revalidatePath('/formulas');
    revalidatePath('/');

    return {
      ok: `تمّت التهيئة: ${tiers} شريحة سعر، ${variants} متغيّر (لون/مقاس) جديد، ${formulas} معادلة. الموجود سلفاً لم يُكرَّر.`,
    };
  } catch (e) {
    return { error: `تعذّرت التهيئة: ${e instanceof Error ? e.message : 'خطأ غير معروف'}` };
  }
}
