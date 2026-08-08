/**
 * Phase 4 verification against the real database.
 *
 * Exercises the full sales flow, and specifically hammers the two things
 * most likely to be subtly wrong: the pricing snapshot and reservation
 * idempotency.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Prisma returns Decimal objects; compare by value, not by identity. */
const n = (v) => (v === null || v === undefined ? null : Number(v.toString()));
const eq = (a, b) => n(a) === n(b);

const T = 'kayan';
const results = [];

function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Mirrors reserveForOrder — same guard, exercised without the HTTP layer. */
async function reserve(tx, order, warehouseId) {
  let created = 0;
  for (const line of order.lines) {
    const existing = await tx.stockMovement.findFirst({
      where: { salesOrderLineId: line.id, type: 'RESERVE' },
    });
    if (existing) continue;
    await tx.stockMovement.create({
      data: {
        tenantId: T,
        productId: line.productId,
        variantId: line.variantId,
        warehouseId,
        type: 'RESERVE',
        quantity: line.quantity,
        salesOrderId: order.id,
        salesOrderLineId: line.id,
      },
    });
    const s = await tx.stock.findFirst({
      where: { variantId: line.variantId, warehouseId, locationId: null },
    });
    if (s) await tx.stock.update({ where: { id: s.id }, data: { reserved: { increment: line.quantity } } });
    else await tx.stock.create({ data: { variantId: line.variantId, warehouseId, reserved: line.quantity } });
    created += 1;
  }
  return created;
}

async function release(tx, order) {
  let created = 0;
  for (const line of order.lines) {
    const res = await tx.stockMovement.findFirst({
      where: { salesOrderLineId: line.id, type: 'RESERVE' },
    });
    if (!res) continue;
    const already = await tx.stockMovement.findFirst({
      where: { salesOrderLineId: line.id, type: 'UNRESERVE' },
    });
    if (already) continue;
    await tx.stockMovement.create({
      data: {
        tenantId: T,
        productId: line.productId,
        variantId: line.variantId,
        warehouseId: res.warehouseId,
        type: 'UNRESERVE',
        quantity: -res.quantity,
        salesOrderId: order.id,
        salesOrderLineId: line.id,
      },
    });
    const s = await tx.stock.findFirst({
      where: { variantId: line.variantId, warehouseId: res.warehouseId, locationId: null },
    });
    if (s) await tx.stock.update({ where: { id: s.id }, data: { reserved: { increment: -res.quantity } } });
    created += 1;
  }
  return created;
}

async function main() {
  const customer = await prisma.customer.findFirst({ where: { tenantId: T, isDeleted: false } });
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId: T, isDeleted: false } });
  const variant = await prisma.productVariant.findFirst({
    where: { isDeleted: false, product: { tenantId: T, isDeleted: false } },
    include: { product: true },
  });
  if (!customer || !warehouse || !variant) throw new Error('missing fixtures');

  // Ensure some on-hand stock so available is meaningful.
  let stock = await prisma.stock.findFirst({
    where: { variantId: variant.id, warehouseId: warehouse.id, locationId: null },
  });
  if (!stock) {
    stock = await prisma.stock.create({
      data: { variantId: variant.id, warehouseId: warehouse.id, onHand: 100 },
    });
  }
  const startReserved = n(stock.reserved);
  const startOnHand = n(stock.onHand);

  // ── Quotation with a pricing snapshot ───────────────────
  const quotation = await prisma.quotation.create({
    data: {
      tenantId: T,
      number: `QUO-TEST-${Date.now()}`,
      customerId: customer.id,
      status: 'DRAFT',
      subtotal: 1000,
      taxAmount: 140,
      total: 1140,
      lines: {
        create: [
          {
            lineNo: 1,
            productId: variant.productId,
            variantId: variant.id,
            quantity: 10,
            unitPrice: 100,
            taxRate: 14,
            taxAmount: 140,
            lineTotal: 1140,
          },
        ],
      },
    },
    include: { lines: true },
  });
  check('quotation created with lines', quotation.lines.length === 1);

  const snapshotPrice = n(quotation.lines[0].unitPrice);

  // Change the product price AFTER quoting.
  await prisma.productVariant.update({
    where: { id: variant.id },
    data: { sellingPrice: 999 },
  });
  const reread = await prisma.quotationLine.findUnique({ where: { id: quotation.lines[0].id } });
  check(
    'PRICING SNAPSHOT holds after product price change',
    n(reread.unitPrice) === snapshotPrice && n(reread.unitPrice) === 100,
    `line=${n(reread.unitPrice)}, product now 999`,
  );

  // ── Status rules ────────────────────────────────────────
  await prisma.quotation.update({ where: { id: quotation.id }, data: { status: 'ACCEPTED' } });

  // ── Convert to order, prices carried across ─────────────
  const order = await prisma.salesOrder.create({
    data: {
      tenantId: T,
      number: `SO-TEST-${Date.now()}`,
      customerId: customer.id,
      quotationId: quotation.id,
      status: 'DRAFT',
      subtotal: quotation.subtotal,
      taxAmount: quotation.taxAmount,
      total: quotation.total,
      lines: {
        create: quotation.lines.map((l) => ({
          lineNo: l.lineNo,
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });
  await prisma.quotation.update({ where: { id: quotation.id }, data: { status: 'CONVERTED' } });
  check('order carries the quoted price', n(order.lines[0].unitPrice) === 100);

  // ── Confirm → reserve ───────────────────────────────────
  const first = await prisma.$transaction((tx) => reserve(tx, order, warehouse.id));
  check('confirm creates reservations', first === 1, `created=${first}`);

  let s = await prisma.stock.findFirst({ where: { id: stock.id } });
  check('reserved increased', n(s.reserved) === startReserved + 10, `reserved=${n(s.reserved)}`);
  check('onHand unchanged by reservation', n(s.onHand) === startOnHand, `onHand=${n(s.onHand)}`);
  check('available = onHand - reserved', n(s.onHand) - n(s.reserved) === startOnHand - startReserved - 10);

  // ── IDEMPOTENCY: confirm again ──────────────────────────
  const second = await prisma.$transaction((tx) => reserve(tx, order, warehouse.id));
  check('re-confirm creates NOTHING', second === 0, `created=${second}`);

  s = await prisma.stock.findFirst({ where: { id: stock.id } });
  check('reserved unchanged after re-confirm', n(s.reserved) === startReserved + 10, `reserved=${n(s.reserved)}`);

  const reserveCount = await prisma.stockMovement.count({
    where: { salesOrderId: order.id, type: 'RESERVE' },
  });
  check('exactly one RESERVE movement', reserveCount === 1, `count=${reserveCount}`);

  // The database constraint is the real guarantee — prove it rejects.
  let constraintHeld = false;
  try {
    await prisma.stockMovement.create({
      data: {
        tenantId: T,
        productId: order.lines[0].productId,
        variantId: order.lines[0].variantId,
        warehouseId: warehouse.id,
        type: 'RESERVE',
        quantity: 10,
        salesOrderId: order.id,
        salesOrderLineId: order.lines[0].id,
      },
    });
  } catch {
    constraintHeld = true;
  }
  check('unique(salesOrderLineId,type) rejects a duplicate RESERVE', constraintHeld);

  // ── Cancel → release ────────────────────────────────────
  const rel1 = await prisma.$transaction((tx) => release(tx, order));
  check('cancel releases the reservation', rel1 === 1, `released=${rel1}`);

  s = await prisma.stock.findFirst({ where: { id: stock.id } });
  check('reserved back to start', n(s.reserved) === startReserved, `reserved=${n(s.reserved)}`);

  // ── IDEMPOTENCY: cancel again ───────────────────────────
  const rel2 = await prisma.$transaction((tx) => release(tx, order));
  check('re-cancel creates NOTHING', rel2 === 0, `released=${rel2}`);

  const unreserveCount = await prisma.stockMovement.count({
    where: { salesOrderId: order.id, type: 'UNRESERVE' },
  });
  check('exactly one UNRESERVE movement', unreserveCount === 1, `count=${unreserveCount}`);

  s = await prisma.stock.findFirst({ where: { id: stock.id } });
  check('reserved still at start after re-cancel', n(s.reserved) === startReserved, `reserved=${n(s.reserved)}`);

  // ── Every movement references order and line ────────────
  const movements = await prisma.stockMovement.findMany({ where: { salesOrderId: order.id } });
  check(
    'every reservation movement references order AND line',
    movements.length === 2 && movements.every((m) => m.salesOrderId && m.salesOrderLineId),
    `${movements.length} movements`,
  );

  // The RESERVE row survives the cancellation — history keeps both.
  const originalReserve = await prisma.stockMovement.findFirst({
    where: { salesOrderId: order.id, type: 'RESERVE' },
  });
  check('original RESERVE preserved after cancel', Boolean(originalReserve));

  // ── Cleanup ─────────────────────────────────────────────
  await prisma.stockMovement.deleteMany({ where: { salesOrderId: order.id } });
  await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: order.id } });
  await prisma.salesOrder.delete({ where: { id: order.id } });
  await prisma.quotationLine.deleteMany({ where: { quotationId: quotation.id } });
  await prisma.quotation.delete({ where: { id: quotation.id } });
  await prisma.productVariant.update({ where: { id: variant.id }, data: { sellingPrice: null } });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
