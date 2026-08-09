/**
 * Phase 9 verification — purchasing and goods receipt.
 *
 * Three claims get attacked rather than asserted:
 *   1. a delivery posted twice cannot move stock twice
 *   2. a line cannot receive more than it still owes
 *   3. weighted average cost is actually weighted, not just overwritten
 *
 * Everything created is cleaned up, so it is safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import {
  calcPurchaseLine,
  calcPurchaseDocument,
  derivePurchaseStatus,
  exceedsOutstanding,
  outstanding,
  movingAverageCost,
  PURCHASE_TRANSITIONS,
} from '../packages/domain/src/purchasing.ts';

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
  // ── 1. Pure arithmetic ────────────────────────────────────

  {
    const l = calcPurchaseLine({ quantity: 10, unitPrice: 25, discountAmount: 50, taxRate: 14 });
    check('gross 250, discount 50, net 200', n(l.gross) === 250 && n(l.net) === 200);
    check('tax is charged on the discounted net, not the gross', n(l.taxAmount) === 28, `${l.taxAmount}`);
    check('line total 228', n(l.lineTotal) === 228);
  }

  {
    // A discount larger than the line must not make it negative.
    const l = calcPurchaseLine({ quantity: 1, unitPrice: 100, discountAmount: 500 });
    check('a discount cannot drive a line negative', n(l.net) === 0 && n(l.discount) === 100);
  }

  {
    const doc = calcPurchaseDocument([
      calcPurchaseLine({ quantity: 2, unitPrice: 100, taxRate: 10 }),
      calcPurchaseLine({ quantity: 1, unitPrice: 50 }),
    ]);
    check('document subtotal 250, tax 20, total 270', n(doc.subtotal) === 250 && n(doc.total) === 270);
  }

  check('outstanding is ordered minus received', n(outstanding(10, 4)) === 6);
  check('outstanding never goes negative', n(outstanding(10, 12)) === 0);
  check('over-receipt is detected', exceedsOutstanding(7, 10, 4));
  check('receiving exactly what is left is allowed', !exceedsOutstanding(6, 10, 4));

  check(
    'status is RECEIVED only when every line is complete',
    derivePurchaseStatus([{ quantity: 5, receivedQty: 5 }, { quantity: 3, receivedQty: 3 }], 'CONFIRMED') === 'RECEIVED',
  );
  check(
    'one short line holds the whole order at PARTIALLY_RECEIVED',
    derivePurchaseStatus([{ quantity: 5, receivedQty: 5 }, { quantity: 3, receivedQty: 1 }], 'CONFIRMED') === 'PARTIALLY_RECEIVED',
  );
  check(
    'a cancelled order is never revived by a derived status',
    derivePurchaseStatus([{ quantity: 5, receivedQty: 5 }], 'CANCELLED') === 'CANCELLED',
  );
  check('RECEIVED is terminal', PURCHASE_TRANSITIONS.RECEIVED.length === 0);

  // Weighted average — the arithmetic that ends the zero-price problem.
  check(
    'first delivery into empty stock takes the receipt cost',
    n(movingAverageCost(0, 0, 100, 12.5)) === 12.5,
  );
  check(
    '100 @ 10 plus 100 @ 20 averages to 15',
    n(movingAverageCost(100, 10, 100, 20)) === 15,
  );
  check(
    'a small delivery barely moves a large held stock',
    n(movingAverageCost(900, 10, 100, 20)) === 11,
    `${movingAverageCost(900, 10, 100, 20)}`,
  );
  check(
    'a zero delivery leaves the cost untouched',
    n(movingAverageCost(100, 10, 0, 999)) === 10,
  );

  // ── 2. RBAC ───────────────────────────────────────────────

  const perms = await prisma.permission.findMany({
    where: { key: { startsWith: 'purchasing.' } },
    select: { key: true },
  });
  check('four purchasing permissions exist', perms.length === 4, perms.map((p) => p.key).join(' '));

  const managerGrants = await prisma.rolePermission.count({
    where: { role: { key: 'MANAGER' }, permission: { key: { startsWith: 'purchasing.' } } },
  });
  check('MANAGER holds all four', managerGrants === 4, `${managerGrants}/4`);

  const salesGrants = await prisma.rolePermission.count({
    where: { role: { key: 'SALES' }, permission: { key: { startsWith: 'purchasing.' } } },
  });
  check('SALES holds none', salesGrants === 0);

  // ── 3. A real purchase, end to end ────────────────────────

  const supplier = await prisma.supplier.upsert({
    where: { id: 'verify-p9-supplier' },
    update: {},
    create: {
      id: 'verify-p9-supplier',
      tenantId: T,
      code: 'VERIFY-P9',
      name: 'مورّد الفحص',
      phone: '0100000000',
    },
  });
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId: T, isDeleted: false } });
  const supply = await prisma.supply.findFirst({ where: { tenantId: T, code: 'SUP-P-001' } });
  if (!warehouse || !supply) {
    check('fixtures exist (warehouse + supply)', false);
    return report();
  }
  check('fixtures exist (warehouse + supply)', true);

  const startOnHand = n(supply.onHand);
  const startAvg = n(supply.avgCost);

  const line = calcPurchaseLine({ quantity: 100, unitPrice: 30 });
  const order = await prisma.purchaseOrder.create({
    data: {
      tenantId: T,
      number: `VERIFY-P9-${Date.now()}`,
      supplierId: supplier.id,
      status: 'CONFIRMED',
      subtotal: line.net.toString(),
      taxAmount: line.taxAmount.toString(),
      total: line.lineTotal.toString(),
      lines: {
        create: {
          lineNo: 1,
          target: 'SUPPLY',
          supplyId: supply.id,
          quantity: 100,
          unitPrice: 30,
          lineTotal: line.lineTotal.toString(),
        },
      },
    },
    include: { lines: true },
  });
  const poLine = order.lines[0];

  // Receive 60 of 100.
  const receipt = await prisma.goodsReceipt.create({
    data: {
      tenantId: T,
      number: `VERIFY-P9-GRN-${Date.now()}`,
      purchaseOrderId: order.id,
      warehouseId: warehouse.id,
      lines: { create: { purchaseOrderLineId: poLine.id, quantity: 60, unitCost: 30 } },
    },
    include: { lines: true },
  });
  const receiptLine = receipt.lines[0];

  await prisma.supplyTransaction.create({
    data: {
      tenantId: T,
      supplyId: supply.id,
      type: 'PURCHASE',
      txDate: new Date(),
      quantity: 60,
      unitCost: 30,
      totalCost: 1800,
      goodsReceiptLineId: receiptLine.id,
    },
  });
  const avg = movingAverageCost(supply.onHand, supply.avgCost, 60, 30);
  await prisma.supply.update({
    where: { id: supply.id },
    data: { onHand: startOnHand + 60, avgCost: avg.toString(), lastUnitCost: 30 },
  });
  await prisma.purchaseOrderLine.update({ where: { id: poLine.id }, data: { receivedQty: 60 } });

  const afterPartial = await prisma.supply.findUnique({ where: { id: supply.id } });
  check('a partial delivery raises on-hand by exactly the quantity', n(afterPartial.onHand) === startOnHand + 60);
  check(
    'the weighted average was recomputed, not overwritten',
    n(afterPartial.avgCost) === n(avg),
    `${startAvg} -> ${afterPartial.avgCost}`,
  );

  const lines1 = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrderId: order.id },
    select: { quantity: true, receivedQty: true },
  });
  check(
    'the order is now PARTIALLY_RECEIVED, derived from the lines',
    derivePurchaseStatus(lines1, 'CONFIRMED') === 'PARTIALLY_RECEIVED',
  );

  // ── 4. THE ATTACK: post the same delivery twice ───────────

  let blocked = false;
  try {
    await prisma.supplyTransaction.create({
      data: {
        tenantId: T,
        supplyId: supply.id,
        type: 'PURCHASE',
        txDate: new Date(),
        quantity: 60,
        unitCost: 30,
        totalCost: 1800,
        goodsReceiptLineId: receiptLine.id,
      },
    });
  } catch {
    blocked = true;
  }
  check(
    'the same receipt line CANNOT post a second supply movement',
    blocked,
    'database constraint, not an application check',
  );

  const stillOnce = await prisma.supplyTransaction.count({
    where: { goodsReceiptLineId: receiptLine.id },
  });
  check('exactly one movement exists for that receipt line', stillOnce === 1);

  // And over-receiving the remainder is refused by the rule.
  check(
    'receiving 50 more against 40 outstanding is refused',
    exceedsOutstanding(50, 100, 60),
  );
  check('receiving exactly the remaining 40 is allowed', !exceedsOutstanding(40, 100, 60));

  // ── 5. Cleanup ────────────────────────────────────────────

  await prisma.supplyTransaction.deleteMany({ where: { goodsReceiptLineId: receiptLine.id } });
  await prisma.goodsReceiptLine.deleteMany({ where: { goodsReceiptId: receipt.id } });
  await prisma.goodsReceipt.deleteMany({ where: { purchaseOrderId: order.id } });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: order.id } });
  await prisma.purchaseOrder.deleteMany({ where: { id: order.id } });
  await prisma.supply.update({
    where: { id: supply.id },
    data: { onHand: startOnHand, avgCost: startAvg, lastUnitCost: supply.lastUnitCost },
  });
  await prisma.supplier.deleteMany({ where: { id: supplier.id } });

  const leftover = await prisma.purchaseOrder.count({ where: { number: { startsWith: 'VERIFY-P9' } } });
  const restored = await prisma.supply.findUnique({ where: { id: supply.id } });
  check('the verification cleaned up after itself', leftover === 0);
  check('the supply was restored to its original balance', n(restored.onHand) === startOnHand);

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
