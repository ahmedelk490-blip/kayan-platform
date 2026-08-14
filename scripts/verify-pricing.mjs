/**
 * تحقّق من شرائح الأسعار.
 *
 * يهاجم ثلاثة أشياء بدل أن يؤكّدها:
 *   1. اختيار الشريحة الصحيحة لكل كمية وخدمة؛
 *   2. أن قيد التفرّد يمنع التكرار فعلاً حين يكون variantId فارغاً —
 *      وهو ما كان لا يفعله قبل NULLS NOT DISTINCT؛
 *   3. أن كمية بلا تغطية تُرجع null لا صفراً.
 */
import { PrismaClient } from '@prisma/client';
import { applicableTier, tierLineTotal, coverageGaps } from '../packages/domain/src/pricing.ts';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const T = 'kayan';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const n = (v) => (v === null ? null : Number(v.toString()));

async function main() {
  const product = await prisma.product.findFirst({
    where: { tenantId: T, sku: { contains: 'TSHIRTS-001' } },
    include: { priceTiers: true },
  });
  if (!product) return check('التيشيرت موجود بشرائحه', false), report();
  check('التيشيرت موجود بشرائحه', product.priceTiers.length === 4, `${product.priceTiers.length} شريحة`);

  const tiers = product.priceTiers.map((t) => ({
    id: t.id,
    variantId: t.variantId,
    service: t.service,
    minQty: t.minQty,
    maxQty: t.maxQty,
    price: t.price,
    currency: t.currency,
    isActive: t.isActive,
  }));

  // ── الأرقام التي أعلنتها الإدارة ─────────────────────────
  const cases = [
    ['EMBROIDERY', 3, 18000, 'تطريز، أقل من 6'],
    ['EMBROIDERY', 6, 17000, 'تطريز، جملة'],
    ['EMBROIDERY', 500, 17000, 'تطريز، كمية كبيرة'],
    ['DTF', 5, 16000, 'DTF، أقل من 6'],
    ['DTF', 6, 15000, 'DTF، جملة'],
  ];
  for (const [service, qty, expected, label] of cases) {
    const tier = applicableTier(tiers, { service, quantity: qty });
    check(
      `${label}: ${qty} قطعة → ${expected.toLocaleString()} د.ع`,
      tier !== null && n(tier.price) === expected,
      tier ? `${n(tier.price)}` : 'لا شريحة',
    );
  }

  // الحدّ بالضبط: 5 تأخذ سعر الصغيرة و6 تأخذ الجملة. خطأ ±1 هنا يعني
  // تسعير كل طلب عند الحدّ بالسعر الخطأ.
  check(
    'الحدّ 5/6 مضبوط ولا يزحف',
    n(applicableTier(tiers, { service: 'DTF', quantity: 5 }).price) === 16000 &&
      n(applicableTier(tiers, { service: 'DTF', quantity: 6 }).price) === 15000,
  );

  const total = tierLineTotal(tiers, { service: 'DTF', quantity: 10 });
  check('إجمالي السطر: 10 × 15,000 = 150,000', n(total) === 150000, `${total}`);

  check(
    'خدمة بلا شريحة تُرجع null لا صفراً',
    tierLineTotal(tiers, { service: 'PRINTING', quantity: 10 }) === null,
    'سعر مخترع على عرض سعر أسوأ من غياب سعر',
  );

  // ── اليلك التركي: فجوة معلنة لا مسكوت عنها ───────────────
  const turkish = await prisma.product.findFirst({
    where: { tenantId: T, sku: { contains: 'VEST-TURKISH-001' } },
    include: { priceTiers: true },
  });
  if (turkish) {
    const tTiers = turkish.priceTiers.map((t) => ({ ...t, price: t.price }));
    check(
      'اليلك التركي بلا سعر للكميات الصغيرة',
      applicableTier(tTiers, { service: 'EMBROIDERY', quantity: 3 }) === null,
      'لم يُرسل الرقم فلم يُخترع',
    );
    const gaps = coverageGaps(tTiers, 'EMBROIDERY');
    check('والفجوة معلنة للمدير', gaps.length > 0, gaps.join(' · '));
  }

  // ── القيد الفريد يمنع التكرار فعلاً ──────────────────────
  //
  // قبل NULLS NOT DISTINCT كان PostgreSQL يعتبر كل NULL مميّزاً، فيمرّ
  // صفّان متطابقان بصمت — أي شريحتان بسعرين مختلفين لنفس الكمية.
  let duplicateRejected = false;
  try {
    await prisma.priceTier.create({
      data: {
        tenantId: T,
        productId: product.id,
        variantId: null,
        service: 'DTF',
        minQty: 6,
        maxQty: null,
        price: '99999',
        currency: 'IQD',
      },
    });
  } catch {
    duplicateRejected = true;
  }
  check(
    'قاعدة البيانات ترفض شريحة مكرّرة رغم أن variantId فارغ',
    duplicateRejected,
    'NULLS NOT DISTINCT — بدونه يمرّ سعران متضاربان لنفس الكمية',
  );

  const stray = await prisma.priceTier.findFirst({ where: { price: '99999' } });
  if (stray) await prisma.priceTier.delete({ where: { id: stray.id } });

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
