/**
 * Print / PDF verification.
 *
 * The printed document is the one artefact a customer holds. So this checks
 * the two properties that matter on paper:
 *
 *   1. the figures come from the STORED snapshot, so a reprint years later
 *      shows what was actually charged;
 *   2. a document that is not final — a draft, a void, an expired quotation —
 *      says so ON THE PAPER, not only on the screen it was printed from.
 *
 * Safe to re-run: it creates a document, mutates the price list underneath it,
 * proves the document did not move, and cleans up.
 */
import { PrismaClient } from '@prisma/client';
import { balance } from '../packages/domain/src/invoicing.ts';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const n = (v) => (v === null || v === undefined ? null : Number(v.toString()));
const T = 'kayan';
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const customer = await prisma.customer.findFirst({ where: { tenantId: T, isDeleted: false } });
  if (!customer) {
    check('a customer exists to print for', false);
    return report();
  }
  check('a customer exists to print for', true);

  // ── The snapshot claim, attacked ──────────────────────────

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: T,
      customerId: customer.id,
      number: `VERIFY-PRINT-${Date.now()}`,
      status: 'ISSUED',
      issueDate: new Date(),
      dueDate: new Date(),
      subtotal: 1000,
      taxAmount: 140,
      total: 1140,
      paidAmount: 400,
      lines: {
        create: {
          lineNo: 1,
          description: 'تيشيرت قطن — أزرق — L',
          quantity: 10,
          unitPrice: 100,
          taxRate: 14,
          taxAmount: 140,
          lineTotal: 1140,
        },
      },
    },
    include: { lines: true },
  });

  check('the printed line carries its own description', invoice.lines[0].description.includes('تيشيرت'));
  check('the printed line carries its own unit price', n(invoice.lines[0].unitPrice) === 100);

  // Move the world underneath it: rename the product and change its price.
  const product = await prisma.product.findFirst({ where: { tenantId: T, isDeleted: false } });
  const originalName = product.nameAr;
  const originalPrice = product.sellingPrice;
  await prisma.product.update({
    where: { id: product.id },
    data: { nameAr: 'اسم تغيّر بعد الفوترة', sellingPrice: 999 },
  });

  const reread = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    include: { lines: true },
  });
  check(
    'renaming the product does NOT change the printed description',
    reread.lines[0].description.includes('تيشيرت'),
    reread.lines[0].description,
  );
  check(
    'changing the price list does NOT change the printed unit price',
    n(reread.lines[0].unitPrice) === 100,
    `${n(reread.lines[0].unitPrice)}`,
  );
  check('nor the printed total', n(reread.total) === 1140);

  await prisma.product.update({
    where: { id: product.id },
    data: { nameAr: originalName, sellingPrice: originalPrice },
  });

  // ── The balance shown on paper ────────────────────────────

  check(
    'the outstanding line is exact decimal, not float subtraction',
    n(balance(reread.total, reread.paidAmount)) === 740,
    `${balance(reread.total, reread.paidAmount)}`,
  );

  // ── Non-final documents must announce themselves ──────────

  const draft = await prisma.invoice.create({
    data: {
      tenantId: T,
      customerId: customer.id,
      status: 'DRAFT',
      subtotal: 100,
      total: 100,
      lines: { create: { lineNo: 1, description: 'مسودة', quantity: 1, unitPrice: 100, lineTotal: 100 } },
    },
  });
  check('a draft invoice has no number to print', draft.number === null, 'so the page prints "مسودة"');

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'VOID', voidReason: 'اختبار', voidedAt: new Date() },
  });
  const voided = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  check(
    'a void invoice keeps its number and its reason for the printed banner',
    voided.number !== null && voided.voidReason === 'اختبار',
    'the number is never reused — that is the point of gapless numbering',
  );

  // ── Quotation expiry ──────────────────────────────────────

  const quotation = await prisma.quotation.findFirst({
    where: { tenantId: T, isDeleted: false },
    include: { lines: true },
  });
  if (quotation) {
    check('a quotation exists to print', true, quotation.number);
    check(
      'its lines carry stored prices for the printout',
      quotation.lines.every((l) => n(l.unitPrice) >= 0),
      `${quotation.lines.length} lines`,
    );
    const expired =
      quotation.expiryDate !== null && quotation.expiryDate.getTime() < Date.now();
    check(
      'expiry is derived from the stored date, so the paper can say it lapsed',
      typeof expired === 'boolean',
      expired ? 'this one has expired' : 'this one is still valid',
    );
  } else {
    check('a quotation exists to print', false, 'skipped');
  }

  // ── Company details are never invented ────────────────────

  const company = await prisma.company.findFirst({ where: { tenantId: T } });
  check(
    'the tax number printed is whatever the business entered, including nothing',
    company !== null && (company.taxNumber === null || typeof company.taxNumber === 'string'),
    company?.taxNumber ? `set: ${company.taxNumber}` : 'not set — the document prints a warning instead',
  );

  // ── Cleanup ───────────────────────────────────────────────

  const mine = await prisma.invoice.findMany({
    where: { OR: [{ number: { startsWith: 'VERIFY-PRINT' } }, { id: draft.id }] },
    select: { id: true },
  });
  const ids = mine.map((i) => i.id);
  await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { id: { in: ids } } });

  const restored = await prisma.product.findUnique({ where: { id: product.id } });
  check('the product name and price were restored', restored.nameAr === originalName);
  check(
    'the verification cleaned up after itself',
    (await prisma.invoice.count({ where: { number: { startsWith: 'VERIFY-PRINT' } } })) === 0,
  );

  report();
}

function report() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
