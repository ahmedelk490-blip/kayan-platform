// فواتير عيّنة بسيطة لإظهار الرسوم البيانية والتفاعلات — تُحذف بسهولة (رقمها
// يبدأ بـ SAMPLE-). idempotent: يمسح العيّنات القديمة ويعيد إنشاءها.
//
// التشغيل:  DATABASE_URL="mysql://..." node prisma/seed-sample-invoices.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const anyProduct = await prisma.product.findFirst({ select: { tenantId: true } });
  if (!anyProduct) throw new Error('لا يوجد مستأجر.');
  const tenantId = anyProduct.tenantId;

  const customer = await prisma.customer.findFirst({
    where: { tenantId, isDeleted: false },
    select: { id: true },
  });
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, isDeleted: false, product: { tenantId, isDeleted: false, status: 'ACTIVE' } },
    include: {
      product: { select: { nameAr: true } },
      color: { select: { nameAr: true } },
      size: { select: { code: true } },
    },
    take: 8,
  });
  if (!customer || variants.length === 0) {
    console.log('لا يوجد عميل أو متغيّرات — لا يمكن إنشاء عيّنات.');
    return;
  }

  // احذف عيّنات سابقة.
  const olds = await prisma.invoice.findMany({
    where: { tenantId, number: { startsWith: 'SAMPLE-' } },
    select: { id: true },
  });
  for (const o of olds) {
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: o.id } });
    await prisma.invoice.delete({ where: { id: o.id } });
  }

  const year = new Date().getFullYear();
  const months = [2, 4, 6, 8, 10];
  let n = 0;
  for (const m of months) {
    n += 1;
    const v = variants[n % variants.length];
    const qty = 10 * n;
    const unit = 15000;
    const lineTotal = qty * unit;
    await prisma.invoice.create({
      data: {
        tenantId,
        customerId: customer.id,
        number: `SAMPLE-${n}`,
        status: 'ISSUED',
        issueDate: new Date(year, m - 1, 10),
        subtotal: lineTotal,
        discountAmount: 0,
        taxAmount: 0,
        total: lineTotal,
        paidAmount: n % 2 === 1 ? lineTotal : Math.round(lineTotal / 2),
        lines: {
          create: [
            {
              lineNo: 1,
              productId: v.productId,
              variantId: v.id,
              description: [v.product.nameAr, v.color?.nameAr, v.size?.code].filter(Boolean).join(' · '),
              quantity: qty,
              unitPrice: unit,
              discountAmount: 0,
              taxRate: 0,
              taxAmount: 0,
              lineTotal,
            },
          ],
        },
      },
    });
  }
  console.log(`أُنشئت ${n} فاتورة عيّنة (SAMPLE-1..${n}). احذفها متى شئت من شاشة الفواتير.`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
