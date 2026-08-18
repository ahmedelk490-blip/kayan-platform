/**
 * شريحة سعر واحدة لكل كمية — يرفضها المحرّك لا الكود.
 *
 * ── الادّعاء ───────────────────────────────────────────────
 *
 * لا يمكن أن يوجد سعران لنفس المنتج والخدمة والكمية. القيد الفريد هو ما
 * يمنع، لا فحصٌ في التطبيق: طلبان متزامنان يمرّان من أي فحص تطبيقيّ معاً.
 *
 * ── لماذا هذا الفحص بالذات ─────────────────────────────────
 *
 * السعر للمنتج كله — لا لمتغيّر بعينه — يترك variantId فارغاً. وكلا
 * المحرّكين يعتبر NULL مميّزاً عن NULL، فصفّان متطابقان تماماً بفراغين
 * يمرّان، ويصير للكمية الواحدة سعران. أيّهما يُعرض؟ الذي يعود أولاً من
 * الفهرس. سعر يظهر بالحظّ.
 *
 * عولجت في PostgreSQL بـ NULLS NOT DISTINCT، ولا مقابل لها في MySQL.
 * فالبديل عمود مولَّد يطوي الفراغ إلى قيمة ثابتة، ويدخل الفهرس مكانه.
 *
 * الفحص يهاجم الحالة مباشرة: يكتب الشريحة، ثم يكتب توأمها، وينتظر رفضاً.
 * ولا يكتفي بذلك — يثبت أن القيد لا يمنع ما يجب أن يمرّ: كميات مختلفة،
 * خدمات مختلفة، ومتغيّرات مختلفة تحت نفس المنتج.
 *
 * آمن لإعادة التشغيل: يحذف ما يُنشئه.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });
const T = `pt-probe-${Date.now()}`;
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** هل رفض المحرّك الكتابة؟ */
async function refused(fn) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  await prisma.tenant.create({ data: { id: T, name: 'probe' } });
  const cat = await prisma.category.create({
    data: { tenantId: T, nameAr: 'فحص', nameEn: 'probe', slug: `probe-${T}` },
  });
  const product = await prisma.product.create({
    data: {
      tenantId: T,
      categoryId: cat.id,
      sku: `SKU-${T}`,
      nameAr: 'منتج الفحص',
      status: 'ACTIVE',
    },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `V-${T}` },
  });

  const tier = (over = {}) => ({
    tenantId: T,
    productId: product.id,
    variantId: null,
    service: 'EMBROIDERY',
    minQty: 6,
    price: '18000',
    currency: 'IQD',
    ...over,
  });

  // ── الحالة الخطرة: فراغان متطابقان ───────────────────────
  await prisma.priceTier.create({ data: tier() });
  check('الشريحة الأولى تُكتب', true, 'يلك تركي · تطريز · من 6 · 18 ألف');

  const twin = await refused(() => prisma.priceTier.create({ data: tier({ price: '99999' }) }));
  check(
    'المحرّك يرفض شريحة ثانية لنفس الكمية',
    twin,
    twin ? 'variantId فارغ في الاثنين ورُفض' : '⚠ مرّت — للكمية سعران',
  );

  const count = await prisma.priceTier.count({
    where: { productId: product.id, service: 'EMBROIDERY', minQty: 6, variantId: null },
  });
  check('صفّ واحد فعلاً في الجدول', count === 1, `${count} صفّ`);

  // ── والسعر المقروء هو المكتوب لا الثاني ──────────────────
  const stored = await prisma.priceTier.findFirst({
    where: { productId: product.id, service: 'EMBROIDERY', minQty: 6, variantId: null },
  });
  check('السعر المخزَّن هو الأول', String(stored?.price) === '18000', `${stored?.price}`);

  // ── وما يجب أن يمرّ يمرّ ─────────────────────────────────
  // قيدٌ يمنع كل شيء ليس قيداً، بل عطلاً.
  const differentQty = await refused(() => prisma.priceTier.create({ data: tier({ minQty: 12 }) }));
  check('كمية مختلفة تُقبل', !differentQty, 'شريحة من 12 قطعة');

  const differentService = await refused(() =>
    prisma.priceTier.create({ data: tier({ service: 'DTF' }) }),
  );
  check('خدمة مختلفة تُقبل', !differentService, 'طباعة DTF بنفس الكمية');

  const withVariant = await refused(() =>
    prisma.priceTier.create({ data: tier({ variantId: variant.id }) }),
  );
  check('متغيّر بعينه يُقبل مع سعر المنتج العام', !withVariant, 'سعر للمقاس لا يمنع سعر المنتج');

  const variantTwin = await refused(() =>
    prisma.priceTier.create({ data: tier({ variantId: variant.id, price: '1' }) }),
  );
  check('لكن لا يُقبل متغيّران متطابقان', variantTwin, 'القيد يعمل مع القيمة كما مع الفراغ');

  // الترتيب: الأبناء قبل الآباء. حذف المستأجر وحده يصطدم بالمفتاح
  // الأجنبي من المنتج إلى تصنيفه — والتصنيف ليس ابن المستأجر في السلسلة.
  await prisma.priceTier.deleteMany({ where: { tenantId: T } });
  await prisma.productVariant.deleteMany({ where: { product: { tenantId: T } } });
  await prisma.product.deleteMany({ where: { tenantId: T } });
  await prisma.category.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.delete({ where: { id: T } });
  check('نُظّف كل ما أنشأه الفحص', (await prisma.tenant.count({ where: { id: T } })) === 0);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} تحقّقاً ناجحاً`);
  if (passed !== results.length) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e.message.split('\n').slice(0, 5).join('\n'));
    await prisma.tenant.deleteMany({ where: { id: T } }).catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
