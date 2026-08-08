/**
 * Phase 5 verification against the real database.
 *
 * Exercises the manufacturing workflow and hammers the three things most
 * likely to be subtly wrong: the status machine (can COMPLETED be reached
 * without QC?), the finished-goods receipt (does it post exactly once and
 * does stock actually move?), and the sales-order coupling.
 *
 * Everything it creates is cleaned up at the end, so it is safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import {
  PRODUCTION_TRANSITIONS,
  PRODUCTION_STATUSES,
  PRIORITY_WEIGHT,
  ACTIVE_PRODUCTION_STATUSES,
} from '../packages/domain/src/production.ts';

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

/**
 * Mirrors changeProductionStatus — the same guard and the same receipt,
 * exercised without the HTTP layer.
 */
async function transition(id, next) {
  const order = await prisma.productionOrder.findUnique({
    where: { id },
    include: { salesOrder: true },
  });
  if (!PRODUCTION_TRANSITIONS[order.status].includes(next)) return 'REJECTED';

  await prisma.$transaction(async (tx) => {
    await tx.productionOrder.update({ where: { id }, data: { status: next } });

    if (next === 'COMPLETED') {
      const already = await tx.stockMovement.findFirst({
        where: { productionOrderId: id, type: 'RECEIPT' },
      });
      if (!already) {
        const wh = await tx.warehouse.findFirst({
          where: { tenantId: T, isDeleted: false },
          orderBy: { code: 'asc' },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: T,
            productId: order.productId,
            variantId: order.variantId,
            warehouseId: wh.id,
            type: 'RECEIPT',
            quantity: order.quantity,
            reference: order.number,
            productionOrderId: id,
          },
        });
        const s = await tx.stock.findFirst({
          where: { variantId: order.variantId, warehouseId: wh.id, locationId: null },
        });
        if (s) {
          await tx.stock.update({
            where: { id: s.id },
            data: { onHand: { increment: order.quantity } },
          });
        } else {
          await tx.stock.create({
            data: { variantId: order.variantId, warehouseId: wh.id, onHand: order.quantity },
          });
        }
      }
    }

    const so = order.salesOrder;
    if (so && !so.isDeleted) {
      if (next === 'IN_PROGRESS' && so.status === 'CONFIRMED') {
        await tx.salesOrder.update({ where: { id: so.id }, data: { status: 'IN_PRODUCTION' } });
      }
      if (next === 'COMPLETED' && so.status === 'IN_PRODUCTION') {
        const outstanding = await tx.productionOrder.count({
          where: {
            salesOrderId: so.id,
            isDeleted: false,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            NOT: { id },
          },
        });
        if (outstanding === 0) {
          await tx.salesOrder.update({ where: { id: so.id }, data: { status: 'READY' } });
        }
      }
    }
  });
  return 'OK';
}

async function main() {
  // ── 1. Pure status rules, no database needed ──────────────

  check(
    'COMPLETED is unreachable except through QC',
    PRODUCTION_STATUSES.filter((s) => PRODUCTION_TRANSITIONS[s].includes('COMPLETED')).join() ===
      'QC',
  );
  check('COMPLETED is terminal', PRODUCTION_TRANSITIONS.COMPLETED.length === 0);
  check('CANCELLED is terminal', PRODUCTION_TRANSITIONS.CANCELLED.length === 0);
  check(
    'every live status can still be cancelled',
    ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'QC'].every((s) =>
      PRODUCTION_TRANSITIONS[s].includes('CANCELLED'),
    ),
  );
  check(
    'no transition points at an unknown status',
    Object.values(PRODUCTION_TRANSITIONS)
      .flat()
      .every((s) => PRODUCTION_STATUSES.includes(s)),
  );
  check('URGENT sorts before LOW', PRIORITY_WEIGHT.URGENT < PRIORITY_WEIGHT.LOW);
  check(
    'ACTIVE statuses exclude DRAFT and the terminals',
    !ACTIVE_PRODUCTION_STATUSES.includes('DRAFT') &&
      !ACTIVE_PRODUCTION_STATUSES.includes('COMPLETED') &&
      !ACTIVE_PRODUCTION_STATUSES.includes('CANCELLED'),
  );

  // ── 2. RBAC is registered in the database ─────────────────

  const perms = await prisma.permission.findMany({
    where: { key: { startsWith: 'manufacturing.' } },
    select: { key: true },
  });
  const keys = perms.map((p) => p.key).sort();
  check(
    'the three manufacturing permissions exist',
    keys.join() === 'manufacturing.confirm,manufacturing.view,manufacturing.write',
    keys.join(' '),
  );
  check(
    'the renamed manufacturing.read no longer exists',
    !(await prisma.permission.findUnique({ where: { key: 'manufacturing.read' } })),
  );

  const managerGrants = await prisma.rolePermission.count({
    where: {
      role: { key: 'MANAGER' },
      permission: { key: { startsWith: 'manufacturing.' } },
    },
  });
  check('MANAGER holds all three', managerGrants === 3, `${managerGrants}/3`);

  const customerGrants = await prisma.rolePermission.count({
    where: {
      role: { key: 'CUSTOMER' },
      permission: { key: { startsWith: 'manufacturing.' } },
    },
  });
  check('CUSTOMER holds none', customerGrants === 0);

  // ── 3. Live workflow against real rows ────────────────────

  const variant = await prisma.productVariant.findFirst({
    where: { isDeleted: false, product: { tenantId: T, isDeleted: false } },
  });
  const warehouse = await prisma.warehouse.findFirst({
    where: { tenantId: T, isDeleted: false },
    orderBy: { code: 'asc' },
  });
  if (!variant || !warehouse) {
    check('fixtures exist (variant + warehouse)', false, 'seed core data first');
    return report();
  }
  check('fixtures exist (variant + warehouse)', true);

  const before = await prisma.stock.findFirst({
    where: { variantId: variant.id, warehouseId: warehouse.id, locationId: null },
  });
  const onHandBefore = n(before?.onHand ?? 0);

  const created = [];
  const po = await prisma.productionOrder.create({
    data: {
      tenantId: T,
      number: `VERIFY-P5-${Date.now()}`,
      productId: variant.productId,
      variantId: variant.id,
      quantity: 25,
      priority: 'URGENT',
      status: 'DRAFT',
    },
  });
  created.push(po.id);

  check('DRAFT cannot jump straight to COMPLETED', (await transition(po.id, 'COMPLETED')) === 'REJECTED');
  check('DRAFT cannot jump straight to IN_PROGRESS', (await transition(po.id, 'IN_PROGRESS')) === 'REJECTED');
  check('DRAFT -> CONFIRMED is allowed', (await transition(po.id, 'CONFIRMED')) === 'OK');
  check('CONFIRMED -> QC is rejected (must run first)', (await transition(po.id, 'QC')) === 'REJECTED');
  check('CONFIRMED -> IN_PROGRESS is allowed', (await transition(po.id, 'IN_PROGRESS')) === 'OK');

  const midway = await prisma.stockMovement.count({ where: { productionOrderId: po.id } });
  check(
    'no stock movement is posted at IN_PROGRESS',
    midway === 0,
    'material issue needs a BOM, which does not exist yet',
  );

  check('IN_PROGRESS -> QC is allowed', (await transition(po.id, 'QC')) === 'OK');
  check(
    'QC allows rework back to IN_PROGRESS',
    PRODUCTION_TRANSITIONS.QC.includes('IN_PROGRESS'),
  );
  check('QC -> COMPLETED posts the receipt', (await transition(po.id, 'COMPLETED')) === 'OK');

  const receipts = await prisma.stockMovement.findMany({
    where: { productionOrderId: po.id, type: 'RECEIPT' },
  });
  check('exactly one finished-goods receipt', receipts.length === 1, `${receipts.length}`);
  check('the receipt is positive and equals the order quantity', eq(receipts[0]?.quantity, 25));

  const after = await prisma.stock.findFirst({
    where: { variantId: variant.id, warehouseId: warehouse.id, locationId: null },
  });
  check('on-hand rose by exactly 25', n(after?.onHand) === onHandBefore + 25, `${onHandBefore} -> ${n(after?.onHand)}`);

  check('COMPLETED is terminal in practice', (await transition(po.id, 'IN_PROGRESS')) === 'REJECTED');

  // Re-running completion must not double-post. Force the status back the way
  // a concurrent request or a bad migration might, then complete again.
  await prisma.productionOrder.update({ where: { id: po.id }, data: { status: 'QC' } });
  await transition(po.id, 'COMPLETED');
  const afterRetry = await prisma.stockMovement.count({
    where: { productionOrderId: po.id, type: 'RECEIPT' },
  });
  const stockAfterRetry = await prisma.stock.findFirst({
    where: { variantId: variant.id, warehouseId: warehouse.id, locationId: null },
  });
  check('completing twice posts one receipt, not two', afterRetry === 1, `${afterRetry}`);
  check('completing twice does not double the stock', n(stockAfterRetry?.onHand) === onHandBefore + 25);

  // The database, not the application, is what actually guarantees this.
  let constraintHeld = false;
  try {
    await prisma.stockMovement.create({
      data: {
        tenantId: T,
        productId: variant.productId,
        variantId: variant.id,
        warehouseId: warehouse.id,
        type: 'RECEIPT',
        quantity: 1,
        productionOrderId: po.id,
      },
    });
  } catch {
    constraintHeld = true;
  }
  check(
    'the unique constraint rejects a second receipt at DB level',
    constraintHeld,
    'not merely an application check',
  );

  // ── 4. Sales order coupling ───────────────────────────────

  const so = await prisma.salesOrder.findFirst({
    where: { tenantId: T, isDeleted: false },
    include: { lines: true },
  });
  if (so && so.lines.length > 0) {
    const originalStatus = so.status;
    await prisma.salesOrder.update({ where: { id: so.id }, data: { status: 'CONFIRMED' } });

    const line = so.lines[0];
    const linked = await prisma.productionOrder.create({
      data: {
        tenantId: T,
        number: `VERIFY-P5-LINK-${Date.now()}`,
        salesOrderId: so.id,
        salesOrderLineId: line.id,
        customerId: so.customerId,
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        status: 'CONFIRMED',
      },
    });
    created.push(linked.id);

    await transition(linked.id, 'IN_PROGRESS');
    const soRunning = await prisma.salesOrder.findUnique({ where: { id: so.id } });
    check('starting production moves the sales order to IN_PRODUCTION', soRunning.status === 'IN_PRODUCTION');

    // A second, unfinished production order must hold the sales order back.
    const sibling = await prisma.productionOrder.create({
      data: {
        tenantId: T,
        number: `VERIFY-P5-SIB-${Date.now()}`,
        salesOrderId: so.id,
        customerId: so.customerId,
        productId: line.productId,
        variantId: line.variantId,
        quantity: 1,
        status: 'IN_PROGRESS',
      },
    });
    created.push(sibling.id);

    await transition(linked.id, 'QC');
    await transition(linked.id, 'COMPLETED');
    const soPartial = await prisma.salesOrder.findUnique({ where: { id: so.id } });
    check(
      'sales order stays IN_PRODUCTION while a sibling is unfinished',
      soPartial.status === 'IN_PRODUCTION',
      soPartial.status,
    );

    await transition(sibling.id, 'QC');
    await transition(sibling.id, 'COMPLETED');
    const soDone = await prisma.salesOrder.findUnique({ where: { id: so.id } });
    check('sales order becomes READY once every order is finished', soDone.status === 'READY', soDone.status);

    check(
      'the production order records which sales order line it serves',
      linked.salesOrderLineId === line.id,
    );

    // Restore the sales order exactly as found.
    await prisma.salesOrder.update({ where: { id: so.id }, data: { status: originalStatus } });
  } else {
    check('a sales order with lines exists to test coupling', false, 'skipped — no fixture');
  }

  // ── 5. Soft delete ────────────────────────────────────────

  const soft = await prisma.productionOrder.create({
    data: {
      tenantId: T,
      number: `VERIFY-P5-SOFT-${Date.now()}`,
      productId: variant.productId,
      variantId: variant.id,
      quantity: 1,
      status: 'DRAFT',
    },
  });
  created.push(soft.id);
  await prisma.productionOrder.update({
    where: { id: soft.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  const visible = await prisma.productionOrder.findFirst({
    where: { id: soft.id, isDeleted: false },
  });
  const row = await prisma.productionOrder.findUnique({ where: { id: soft.id } });
  check('soft delete hides the row from lists', visible === null);
  check('soft delete keeps the row on disk', row !== null && row.deletedAt !== null);

  // ── Cleanup ───────────────────────────────────────────────

  await prisma.stockMovement.deleteMany({ where: { productionOrderId: { in: created } } });
  await prisma.workOrder.deleteMany({ where: { productionOrderId: { in: created } } });
  await prisma.productionOrder.deleteMany({ where: { id: { in: created } } });

  // Put the stock projection back exactly where it started.
  const restore = await prisma.stock.findFirst({
    where: { variantId: variant.id, warehouseId: warehouse.id, locationId: null },
  });
  if (restore) await prisma.stock.update({ where: { id: restore.id }, data: { onHand: onHandBefore } });

  const leftover = await prisma.productionOrder.count({ where: { number: { startsWith: 'VERIFY-P5' } } });
  check('the verification cleaned up after itself', leftover === 0, `${leftover} left`);

  report();
}

function report() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    console.log('failed:');
    for (const r of results.filter((x) => !x.pass)) console.log(`  - ${r.name}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
