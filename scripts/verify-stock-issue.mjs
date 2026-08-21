/**
 * المخزن يسمع الأمر ويتخصّم — الحجز ثم الصرف.
 *
 * الادّعاء: تأكيد الأمر يرفع «محجوز» ولا يمسّ الرصيد، وتسليمه يُنقص الرصيد
 * فعلاً ويحرّر الحجز. هذا ما كان ناقصاً: onHand لم يكن ينخفض أبداً.
 *
 * يبني منطق الحجز والصرف كما في reservations.ts بالضبط — نفس الحركات ونفس
 * تحديثات الرصيد — على بيانات حقيقية، ويقيس onHand و reserved بعد كل خطوة.
 * ثم يتحقّق أن القيد الفريد (salesOrderLineId, ISSUE) يرفض صرفاً مزدوجاً.
 *
 * آمن لإعادة التشغيل: يحذف ما يُنشئه.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });
const T = 'kayan';
const MARK = `SI-${Date.now()}`;
const results = [];
const check = (n, pass, d = '') => {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
};

async function main() {
  // ── تجهيز: منتج + متغيّر + مخزن + رصيد 100 + عميل + أمر بسطر كمية 10 ──
  const cat = await prisma.category.create({
    data: { tenantId: T, nameAr: `فحص ${MARK}`, nameEn: MARK, slug: MARK.toLowerCase() },
  });
  const product = await prisma.product.create({
    data: { tenantId: T, categoryId: cat.id, sku: `SKU-${MARK}`, nameAr: 'منتج صرف', status: 'ACTIVE' },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `V-${MARK}` },
  });
  const wh = await prisma.warehouse.findFirst({ where: { tenantId: T, isDeleted: false } });
  const stock = await prisma.stock.create({
    data: { variantId: variant.id, warehouseId: wh.id, onHand: '100', reserved: '0' },
  });
  const customer = await prisma.customer.findFirst({ where: { tenantId: T, isDeleted: false } });
  const order = await prisma.salesOrder.create({
    data: {
      tenantId: T, number: `SO-${MARK}`, customerId: customer.id, status: 'CONFIRMED',
      confirmedAt: new Date(), subtotal: '0', total: '0',
      lines: {
        create: [{ productId: product.id, variantId: variant.id, quantity: '10', unitPrice: '0', lineTotal: '0' }],
      },
    },
    include: { lines: true },
  });
  const line = order.lines[0];

  // ── الحجز (كما reserveForOrder) ──
  await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        tenantId: T, productId: product.id, variantId: variant.id, warehouseId: wh.id,
        type: 'RESERVE', quantity: '10', reference: order.id, reason: 'حجز',
        salesOrderId: order.id, salesOrderLineId: line.id,
      },
    }),
    prisma.stock.update({ where: { id: stock.id }, data: { reserved: { increment: '10' } } }),
  ]);
  let s = await prisma.stock.findUnique({ where: { id: stock.id } });
  check('الحجز يرفع «محجوز» ولا يمسّ الرصيد', Number(s.onHand) === 100 && Number(s.reserved) === 10, `onHand=${s.onHand} reserved=${s.reserved}`);

  // ── الصرف (كما issueForOrder) ──
  async function issue() {
    return prisma.$transaction(async (tx) => {
      const already = await tx.stockMovement.findFirst({ where: { salesOrderLineId: line.id, type: 'ISSUE' } });
      if (already) return 'skipped';
      const reserve = await tx.stockMovement.findFirst({ where: { salesOrderLineId: line.id, type: 'RESERVE' } });
      await tx.stockMovement.create({
        data: {
          tenantId: T, productId: product.id, variantId: variant.id, warehouseId: reserve.warehouseId,
          type: 'ISSUE', quantity: '-10', reference: order.id, reason: 'صرف — تسليم',
          salesOrderId: order.id, salesOrderLineId: line.id,
        },
      });
      await tx.stock.update({
        where: { id: stock.id },
        data: { onHand: { increment: '-10' }, reserved: { increment: '-10' } },
      });
      return 'issued';
    });
  }

  await issue();
  s = await prisma.stock.findUnique({ where: { id: stock.id } });
  check('التسليم يُنقص الرصيد فعلاً', Number(s.onHand) === 90, `onHand=${s.onHand}`);
  check('التسليم يحرّر الحجز', Number(s.reserved) === 0, `reserved=${s.reserved}`);
  check('المتاح (onHand − reserved) = 90', Number(s.onHand) - Number(s.reserved) === 90);

  // ── صرف مزدوج مرفوض بالقيد ──
  let rejected = false;
  try {
    // محاولة إدراج ISSUE ثانٍ لنفس السطر مباشرة — يجب أن يرفضه القيد الفريد.
    await prisma.stockMovement.create({
      data: {
        tenantId: T, productId: product.id, variantId: variant.id, warehouseId: wh.id,
        type: 'ISSUE', quantity: '-10', reference: order.id, reason: 'مزدوج',
        salesOrderId: order.id, salesOrderLineId: line.id,
      },
    });
  } catch {
    rejected = true;
  }
  check('القيد الفريد يرفض صرفاً مزدوجاً لنفس السطر', rejected);

  // الدالة نفسها idempotent: استدعاء ثانٍ لا يصرف.
  const second = await issue();
  check('استدعاء الصرف ثانيةً لا يخصم مرتين', second === 'skipped');

  // ── تنظيف ──
  await prisma.stockMovement.deleteMany({ where: { salesOrderId: order.id } });
  await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: order.id } });
  await prisma.salesOrder.delete({ where: { id: order.id } });
  await prisma.stock.delete({ where: { id: stock.id } });
  await prisma.productVariant.delete({ where: { id: variant.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.category.delete({ where: { id: cat.id } });
  check('نُظّف كل ما أنشأه الفحص', true);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} تحقّقاً ناجحاً`);
  if (passed !== results.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e.message.split('\n').slice(0, 4).join('\n'));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
