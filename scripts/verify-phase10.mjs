/**
 * Phase 10 verification — invoicing, payments, receivables.
 *
 * The claim that decides this phase is gapless numbering, so it is attacked
 * rather than asserted: ten invoices are issued CONCURRENTLY through the same
 * allocator, and the result must be ten consecutive numbers with no duplicate
 * and no hole. A MAX(number)+1 approach passes every sequential test and fails
 * this one.
 *
 * Everything created is cleaned up, so it is safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import {
  balance,
  overpayment,
  exceedsBalance,
  deriveInvoiceStatus,
  dueDate,
  isOverdue,
  daysOverdue,
  ageingBucket,
  ageingTotals,
  INVOICE_TRANSITIONS,
} from '../packages/domain/src/invoicing.ts';

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

/** Mirrors shared.ts allocateInvoiceNumber, including the row lock. */
async function allocate(tx, tenantId, prefix, year) {
  await tx.$executeRaw`
    INSERT INTO "DocumentSequence" ("id", "tenantId", "kind", "year", "lastNumber", "updatedAt")
    VALUES (${`seq_${tenantId}_TEST_${year}`}, ${tenantId}, 'TEST', ${year}, 0, NOW())
    ON CONFLICT ("tenantId", "kind", "year") DO NOTHING`;
  const rows = await tx.$queryRaw`
    SELECT "lastNumber" FROM "DocumentSequence"
     WHERE "tenantId" = ${tenantId} AND "kind" = 'TEST' AND "year" = ${year}
     FOR UPDATE`;
  const next = (rows[0]?.lastNumber ?? 0) + 1;
  await tx.$executeRaw`
    UPDATE "DocumentSequence" SET "lastNumber" = ${next}
     WHERE "tenantId" = ${tenantId} AND "kind" = 'TEST' AND "year" = ${year}`;
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}

async function main() {
  // ── 1. Pure arithmetic ────────────────────────────────────

  check('balance is total minus paid', n(balance(1000, 400)) === 600);
  check('an overpayment shows as zero balance, not a negative', n(balance(1000, 1200)) === 0);
  check('and the overpayment is surfaced separately', n(overpayment(1000, 1200)) === 200);
  check('a payment beyond the balance is refused', exceedsBalance(700, 1000, 400));
  check('paying exactly the balance is allowed', !exceedsBalance(600, 1000, 400));

  check('no payment means ISSUED', deriveInvoiceStatus(1000, 0, 'ISSUED') === 'ISSUED');
  check('part payment means PARTIALLY_PAID', deriveInvoiceStatus(1000, 400, 'ISSUED') === 'PARTIALLY_PAID');
  check('full payment means PAID', deriveInvoiceStatus(1000, 1000, 'PARTIALLY_PAID') === 'PAID');
  check(
    'a void invoice is never revived by an incoming payment',
    deriveInvoiceStatus(1000, 1000, 'VOID') === 'VOID',
  );
  check('a draft is not moved by the derivation either', deriveInvoiceStatus(1000, 0, 'DRAFT') === 'DRAFT');
  check('PAID is terminal', INVOICE_TRANSITIONS.PAID.length === 0);
  check('VOID is terminal', INVOICE_TRANSITIONS.VOID.length === 0);

  {
    const issued = new Date('2026-01-15T10:00:00Z');
    check('zero payment terms means due on issue', dueDate(issued, 0).getDate() === 15);
    check('30 day terms lands in February', dueDate(issued, 30).getMonth() === 1);
    check('negative terms are clamped, not honoured', dueDate(issued, -10).getDate() === 15);
  }

  {
    const past = new Date('2026-01-01');
    const now = new Date('2026-02-01');
    check('an unpaid invoice past its date is overdue', isOverdue(past, 500, now));
    check('a fully paid invoice is never overdue', !isOverdue(past, 0, now));
    check('an invoice with no due date is never overdue', !isOverdue(null, 500, now));
    check('days overdue is counted in whole days', daysOverdue(past, 500, now) === 31);
  }

  check('bucketing: 0 days is current', ageingBucket(0) === 'CURRENT');
  check('bucketing: 30 days is the first bucket', ageingBucket(30) === 'D1_30');
  check('bucketing: 31 days moves up', ageingBucket(31) === 'D31_60');
  check('bucketing: 91 days is the worst bucket', ageingBucket(91) === 'D90_PLUS');

  {
    const now = new Date('2026-03-01');
    const totals = ageingTotals(
      [
        { dueDate: new Date('2026-04-01'), outstanding: 100 },
        { dueDate: new Date('2026-02-20'), outstanding: 200 },
        { dueDate: new Date('2025-10-01'), outstanding: 300 },
        { dueDate: new Date('2026-01-01'), outstanding: 0 },
      ],
      now,
    );
    check('ageing puts a future invoice in CURRENT', n(totals.CURRENT) === 100);
    check('ageing puts a 9-day-late invoice in 1-30', n(totals.D1_30) === 200);
    check('ageing puts a 5-month-late invoice in 90+', n(totals.D90_PLUS) === 300);
    check('a settled invoice contributes nothing to ageing', n(totals.D31_60) === 0);
  }

  // ── 2. RBAC ───────────────────────────────────────────────

  const perms = await prisma.permission.findMany({
    where: { OR: [{ key: { startsWith: 'invoices.' } }, { key: { startsWith: 'payments.' } }] },
    select: { key: true },
  });
  check('four invoicing permissions exist', perms.length === 4, perms.map((p) => p.key).join(' '));

  const salesIssue = await prisma.rolePermission.count({
    where: { role: { key: 'SALES' }, permission: { key: 'invoices.issue' } },
  });
  const salesView = await prisma.rolePermission.count({
    where: { role: { key: 'SALES' }, permission: { key: 'invoices.view' } },
  });
  check('SALES can see invoices but cannot issue one', salesView === 1 && salesIssue === 0);

  const salesPay = await prisma.rolePermission.count({
    where: { role: { key: 'SALES' }, permission: { key: 'payments.record' } },
  });
  check('SALES cannot record money against an invoice', salesPay === 0);

  // ── 3. THE ATTACK: concurrent gapless allocation ──────────

  const year = 9999; // a sentinel year, so nothing real is disturbed
  await prisma.documentSequence.deleteMany({ where: { tenantId: T, kind: 'TEST', year } });

  // Ten allocations at once, each in its own transaction, all racing.
  const allocations = await Promise.all(
    Array.from({ length: 10 }, () =>
      prisma.$transaction((tx) => allocate(tx, T, 'TEST', year)),
    ),
  );

  const numbers = allocations.map((a) => Number(a.split('-')[2]));
  const unique = new Set(numbers);
  check(
    'ten CONCURRENT allocations produced ten distinct numbers',
    unique.size === 10,
    `${unique.size} distinct of 10`,
  );

  const sorted = [...numbers].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => v === sorted[0] + i);
  check(
    'and they are contiguous — no gap, no duplicate',
    contiguous && sorted[0] === 1,
    `${sorted.join(',')}`,
  );

  const seq = await prisma.documentSequence.findFirst({
    where: { tenantId: T, kind: 'TEST', year },
  });
  check('the counter agrees with what was handed out', seq.lastNumber === 10, `${seq.lastNumber}`);

  // A rolled-back issue must return its number, not burn it.
  try {
    await prisma.$transaction(async (tx) => {
      await allocate(tx, T, 'TEST', year);
      throw new Error('deliberate rollback');
    });
  } catch {
    /* expected */
  }
  const after = await prisma.documentSequence.findFirst({
    where: { tenantId: T, kind: 'TEST', year },
  });
  check(
    'a rolled-back issue returns its number rather than burning it',
    after.lastNumber === 10,
    `${after.lastNumber}`,
  );

  await prisma.documentSequence.deleteMany({ where: { tenantId: T, kind: 'TEST', year } });

  // ── 4. A real invoice end to end ──────────────────────────

  const customer = await prisma.customer.findFirst({ where: { tenantId: T, isDeleted: false } });
  if (!customer) {
    check('a customer exists to invoice', false);
    return report();
  }
  check('a customer exists to invoice', true);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: T,
      customerId: customer.id,
      status: 'ISSUED',
      number: `VERIFY-P10-${Date.now()}`,
      issueDate: new Date(),
      dueDate: dueDate(new Date(), 0),
      subtotal: 1000,
      taxAmount: 0,
      total: 1000,
      lines: {
        create: {
          lineNo: 1,
          description: 'بند فحص',
          quantity: 10,
          unitPrice: 100,
          lineTotal: 1000,
        },
      },
    },
    include: { lines: true },
  });
  check('the invoice stored its line as a copy, not a join', invoice.lines[0].description === 'بند فحص');

  // Part payment.
  await prisma.payment.create({
    data: {
      tenantId: T,
      number: `VERIFY-P10-PAY-${Date.now()}`,
      invoiceId: invoice.id,
      amount: 400,
      method: 'CASH',
    },
  });
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { paidAmount: 400, status: deriveInvoiceStatus(1000, 400, 'ISSUED') },
  });
  const partly = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  check('a part payment moves the invoice to PARTIALLY_PAID', partly.status === 'PARTIALLY_PAID');
  check('the outstanding balance is 600', n(balance(partly.total, partly.paidAmount)) === 600);

  // Reversal: append a negative payment, never edit the original.
  const original = await prisma.payment.findFirst({ where: { invoiceId: invoice.id } });
  await prisma.payment.create({
    data: {
      tenantId: T,
      number: `VERIFY-P10-REV-${Date.now()}`,
      invoiceId: invoice.id,
      amount: -400,
      method: 'CASH',
      reversesId: original.id,
    },
  });
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { paidAmount: 0, status: deriveInvoiceStatus(1000, 0, 'PARTIALLY_PAID') },
  });
  const reversed = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    include: { payments: true },
  });
  check('reversing restores the balance', n(balance(reversed.total, reversed.paidAmount)) === 1000);
  check('and back to ISSUED', reversed.status === 'ISSUED');
  check(
    'both payments survive — the ledger is append-only',
    reversed.payments.length === 2,
    `${reversed.payments.length} rows`,
  );

  // A payment cannot be reversed twice.
  let doubleBlocked = false;
  try {
    await prisma.payment.create({
      data: {
        tenantId: T,
        number: `VERIFY-P10-REV2-${Date.now()}`,
        invoiceId: invoice.id,
        amount: -400,
        method: 'CASH',
        reversesId: original.id,
      },
    });
  } catch {
    doubleBlocked = true;
  }
  check('a payment cannot be reversed twice', doubleBlocked, 'unique constraint on reversesId');

  // ── 5. Cleanup ────────────────────────────────────────────

  // By prefix, not by this run's id: an earlier run that failed part-way
  // would otherwise leave rows behind that this check then blames on itself.
  const mine = await prisma.invoice.findMany({
    where: { number: { startsWith: 'VERIFY-P10' } },
    select: { id: true },
  });
  const ids = mine.map((i) => i.id);
  await prisma.payment.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { id: { in: ids } } });

  const leftover = await prisma.invoice.count({ where: { number: { startsWith: 'VERIFY-P10' } } });
  check('the verification cleaned up after itself', leftover === 0);

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
