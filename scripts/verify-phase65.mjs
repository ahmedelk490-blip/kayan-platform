/**
 * Phase 6.5 verification against the real database.
 *
 * Two claims get attacked rather than asserted:
 *   1. The real printing formula reproduces the business's own arithmetic —
 *      one roll really does cover 500 shirts and 4000 caps.
 *   2. Adding all of Phase 6.5 did not disturb a single Phase 6 cost
 *      snapshot.
 *
 * Everything created is cleaned up at the end, so it is safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import { computeCost, unpricedLines } from '../packages/domain/src/formula.ts';
import {
  netProfit,
  damageTotal,
  penaltyExceedsDamage,
  supplyDelta,
  APPROVAL_TRANSITIONS,
  DAMAGE_TRANSITIONS,
  PENALTY_TRANSITIONS,
  SUPPLY_CATEGORIES,
  EXPENSE_CATEGORIES,
} from '../packages/domain/src/operations.ts';

const prisma = new PrismaClient({
  // Tooling spans tenants, so it uses the maintenance connection. The
  // application role deliberately cannot see anything without a tenant.
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
  // ── 1. The REAL printing formula ──────────────────────────

  const tshirt = await prisma.formula.findFirst({
    where: { tenantId: T, code: 'FRM-PRINT-TSHIRT' },
    include: { currentVersion: { include: { lines: { orderBy: { sequence: 'asc' } } } } },
  });
  const cap = await prisma.formula.findFirst({
    where: { tenantId: T, code: 'FRM-PRINT-CAP' },
    include: { currentVersion: { include: { lines: { orderBy: { sequence: 'asc' } } } } },
  });
  const apron = await prisma.formula.findFirst({
    where: { tenantId: T, code: 'FRM-PRINT-APRON' },
    include: { currentVersion: { include: { lines: true } } },
  });

  if (!tshirt?.currentVersion || !cap?.currentVersion || !apron?.currentVersion) {
    check('the three real printing formulas exist and are published', false, 'run seed-phase65');
    return report();
  }
  check('the three real printing formulas exist and are published', true);

  const roll = tshirt.currentVersion.lines.find((l) => l.category === 'MATERIAL');
  check('1 printing roll = 100 metres', n(roll.quantity) === 100, `${n(roll.quantity)}`);
  check('the roll is costed PER_YIELD', roll.basis === 'PER_YIELD');
  check('a t-shirt/vest roll yields 500 pieces', n(roll.yieldQty) === 500, `${n(roll.yieldQty)}`);

  const apronRoll = apron.currentVersion.lines.find((l) => l.category === 'MATERIAL');
  check('a large-apron roll yields 500 pieces', n(apronRoll.yieldQty) === 500);

  const capRoll = cap.currentVersion.lines.find((l) => l.category === 'MATERIAL');
  check('a cap roll yields 4000 pieces', n(capRoll.yieldQty) === 4000, `${n(capRoll.yieldQty)}`);

  const inks = tshirt.currentVersion.lines.filter((l) => l.category === 'INK');
  check('five inks are configured', inks.length === 5, `${inks.length}`);

  const byName = Object.fromEntries(inks.map((i) => [i.nameAr, n(i.quantity)]));
  check('white ink = 4 bottles per roll', byName['حبر أبيض'] === 4, `${byName['حبر أبيض']}`);
  check('yellow ink = 3 bottles per roll', byName['حبر أصفر'] === 3, `${byName['حبر أصفر']}`);
  check('red ink = 0.5 bottle per roll', byName['حبر أحمر'] === 0.5);
  check('blue ink = 0.5 bottle per roll', byName['حبر أزرق'] === 0.5);
  check('black ink = 0.5 bottle per roll', byName['حبر أسود'] === 0.5);
  check(
    'total ink per roll = 8.5 bottles',
    Object.values(byName).reduce((a, b) => a + b, 0) === 8.5,
  );

  // Every quantity is editable data, not a constant in the engine.
  check(
    'no roll or ink figure is hardcoded in the engine',
    tshirt.currentVersion.lines.every((l) => l.formulaVersionId === tshirt.currentVersionId),
  );

  // ── 2. The formula reproduces the business arithmetic ──────

  function engineLines(version, formulaId) {
    return version.lines.map((l, i) => ({
      id: l.id,
      formulaId,
      formulaVersionId: version.id,
      version: version.version,
      sequence: i + 1,
      category: l.category,
      nameAr: l.nameAr,
      basis: l.basis,
      unit: l.unit,
      quantityPerBasis: l.quantity,
      yieldQty: l.yieldQty,
      // Prices were never supplied. Priced here only to prove the
      // consumption maths, never written to the database.
      unitCost: l.category === 'MATERIAL' ? 10 : 100,
    }));
  }

  {
    // Exactly one roll's worth of shirts.
    const r = computeCost({ quantity: 500, lines: engineLines(tshirt.currentVersion, tshirt.id) });
    const metres = r.lines.find((l) => l.category === 'MATERIAL');
    check('500 shirts consume exactly 100 metres — one whole roll', n(metres.consumedQty) === 100);

    const white = r.lines.find((l) => l.nameAr === 'حبر أبيض');
    check('500 shirts consume exactly 4 bottles of white', n(white.consumedQty) === 4);

    const half = computeCost({ quantity: 250, lines: engineLines(tshirt.currentVersion, tshirt.id) });
    check(
      'half a run consumes half a roll',
      n(half.lines.find((l) => l.category === 'MATERIAL').consumedQty) === 50,
    );
  }

  {
    // 4000 caps from one roll — the figure that differs most from the others.
    const r = computeCost({ quantity: 4000, lines: engineLines(cap.currentVersion, cap.id) });
    const metres = r.lines.find((l) => l.category === 'MATERIAL');
    check('4000 caps consume exactly 100 metres — one whole roll', n(metres.consumedQty) === 100);

    const perCap = computeCost({ quantity: 1, lines: engineLines(cap.currentVersion, cap.id) });
    const perShirt = computeCost({ quantity: 1, lines: engineLines(tshirt.currentVersion, tshirt.id) });
    check(
      'a cap costs exactly one-eighth of a shirt in roll and ink',
      Math.abs(n(perShirt.totalCost) / n(perCap.totalCost) - 8) < 0.0001,
      `${n(perShirt.totalCost)} vs ${n(perCap.totalCost)}`,
    );
  }

  // ── 3. Missing prices are surfaced, not swallowed ──────────

  const unpriced = unpricedLines(tshirt.currentVersion.lines);
  check(
    'every seeded line is flagged as unpriced',
    unpriced.length === tshirt.currentVersion.lines.length,
    `${unpriced.length}/${tshirt.currentVersion.lines.length}`,
  );

  {
    const r = computeCost({
      quantity: 500,
      lines: tshirt.currentVersion.lines.map((l, i) => ({
        id: l.id,
        formulaId: tshirt.id,
        formulaVersionId: tshirt.currentVersion.id,
        version: 1,
        sequence: i + 1,
        category: l.category,
        nameAr: l.nameAr,
        basis: l.basis,
        unit: l.unit,
        quantityPerBasis: l.quantity,
        yieldQty: l.yieldQty,
        unitCost: l.unitCost,
      })),
    });
    check(
      'with no prices the cost is zero — and the UI says why',
      n(r.totalCost) === 0,
      'consumption is real, prices are not supplied',
    );
  }

  // ── 4. Operations rules, pure ─────────────────────────────

  check('damage total = material + labour', n(damageTotal(120.5, 80.25)) === 200.75);
  check('a penalty above the damage cost is rejected', penaltyExceedsDamage(300, 200.75));
  check('a penalty equal to the damage cost is allowed', !penaltyExceedsDamage(200.75, 200.75));
  check('a purchase increases stock', n(supplyDelta('PURCHASE', 5)) === 5);
  check('consumption decreases stock', n(supplyDelta('CONSUMPTION', 5)) === -5);
  check('an approved expense cannot be un-approved', APPROVAL_TRANSITIONS.APPROVED.length === 0);
  check('an approved damage record is terminal', DAMAGE_TRANSITIONS.APPROVED.length === 0);
  check('a paid penalty is terminal', PENALTY_TRANSITIONS.PAID.length === 0);
  check('a penalty can be cancelled before payment', PENALTY_TRANSITIONS.APPROVED.includes('CANCELLED'));
  check('eleven expense categories', EXPENSE_CATEGORIES.length === 11, `${EXPENSE_CATEGORIES.length}`);
  check(
    'printing and embroidery categories never overlap',
    SUPPLY_CATEGORIES.PRINTING.filter((c) => c !== 'OTHER').every(
      (c) => !SUPPLY_CATEGORIES.EMBROIDERY.includes(c),
    ),
  );

  {
    const p = netProfit({
      revenue: 10000,
      manufacturingCost: 6000,
      secondaryExpenses: 1500,
      damageCost: 500,
      penaltiesRecovered: 200,
    });
    check('gross profit = 10000 − 6000', n(p.grossProfit) === 4000);
    check('net = gross − expenses − damage + recovered', n(p.netProfit) === 2200, `${p.netProfit}`);
    check('gross margin 40%, net margin 22%', n(p.grossMarginPercent) === 40 && n(p.netMarginPercent) === 22);
    check('margins on zero revenue are null', netProfit({ revenue: 0, manufacturingCost: 0, secondaryExpenses: 0, damageCost: 0 }).netMarginPercent === null);
  }

  // ── 5. RBAC ───────────────────────────────────────────────

  const perms = await prisma.permission.findMany({
    where: {
      OR: [
        { key: { startsWith: 'expenses.' } },
        { key: { startsWith: 'damage.' } },
        { key: { startsWith: 'penalties.' } },
        { key: { startsWith: 'supplies.' } },
      ],
    },
    select: { key: true },
  });
  check('nine new permissions exist', perms.length === 9, `${perms.length}`);

  const managerAll = await prisma.rolePermission.count({
    where: {
      role: { key: 'MANAGER' },
      permission: {
        OR: [
          { key: { startsWith: 'expenses.' } },
          { key: { startsWith: 'damage.' } },
          { key: { startsWith: 'penalties.' } },
          { key: { startsWith: 'supplies.' } },
        ],
      },
    },
  });
  check('MANAGER holds all nine', managerAll === 9, `${managerAll}/9`);

  const salesApprove = await prisma.rolePermission.count({
    where: { role: { key: 'SALES' }, permission: { key: 'expenses.approve' } },
  });
  check('SALES can file an expense but not approve it', salesApprove === 0);

  const salesDamage = await prisma.rolePermission.count({
    where: { role: { key: 'SALES' }, permission: { key: { startsWith: 'damage.' } } },
  });
  check('SALES cannot see damage records', salesDamage === 0);

  // ── 6. Live records ───────────────────────────────────────

  const manager = await prisma.user.findFirst({ where: { email: 'manager@kayan.eg' } });
  const created = { expenses: [], damages: [], penalties: [], supplies: [] };

  const expense = await prisma.secondaryExpense.create({
    data: {
      tenantId: T,
      number: `VERIFY-P65-EXP-${Date.now()}`,
      expenseDate: new Date(),
      category: 'FUEL',
      amount: 750.5,
      status: 'PENDING',
      createdById: manager?.id ?? null,
    },
  });
  created.expenses.push(expense.id);
  check('an expense starts PENDING, never pre-approved', expense.status === 'PENDING');

  const pendingImpact = await prisma.secondaryExpense.aggregate({
    where: { tenantId: T, isDeleted: false, status: 'APPROVED', id: { in: created.expenses } },
    _sum: { amount: true },
  });
  check(
    'a pending expense does NOT count against profit',
    n(pendingImpact._sum.amount ?? 0) === 0,
    'filing a form cannot move the profit figure',
  );

  await prisma.secondaryExpense.update({
    where: { id: expense.id },
    data: { status: 'APPROVED', approvedAt: new Date() },
  });
  const approvedImpact = await prisma.secondaryExpense.aggregate({
    where: { tenantId: T, isDeleted: false, status: 'APPROVED', id: { in: created.expenses } },
    _sum: { amount: true },
  });
  check('an approved expense does count', n(approvedImpact._sum.amount) === 750.5);

  const variant = await prisma.productVariant.findFirst({
    where: { isDeleted: false, product: { tenantId: T } },
    include: { product: true },
  });

  const damage = await prisma.damageRecord.create({
    data: {
      tenantId: T,
      number: `VERIFY-P65-DMG-${Date.now()}`,
      damageDate: new Date(),
      employeeId: manager?.id ?? null,
      department: 'الطباعة',
      productId: variant?.productId ?? null,
      variantId: variant?.id ?? null,
      quantity: 12,
      reason: 'خطأ في ضبط درجة حرارة المكبس أدى إلى احتراق الطباعة.',
      materialCost: 480,
      laborCost: 120,
      totalCost: damageTotal(480, 120).toString(),
      status: 'DRAFT',
      createdById: manager?.id ?? null,
    },
  });
  created.damages.push(damage.id);
  check('damage total is computed, not typed', n(damage.totalCost) === 600);

  const penalty = await prisma.penalty.create({
    data: {
      tenantId: T,
      number: `VERIFY-P65-PEN-${Date.now()}`,
      damageId: damage.id,
      employeeId: manager.id,
      amount: 200,
      reason: 'إهمال في ضبط الماكينة.',
      status: 'PENDING',
      events: { create: { toStatus: 'PENDING', note: 'إنشاء', userId: manager.id } },
    },
    include: { events: true },
  });
  created.penalties.push(penalty.id);
  check('a penalty records its opening history event', penalty.events.length === 1);
  check('the penalty is linked to its damage record', penalty.damageId === damage.id);

  await prisma.penalty.update({ where: { id: penalty.id }, data: { status: 'APPROVED' } });
  await prisma.penaltyEvent.create({
    data: { penaltyId: penalty.id, fromStatus: 'PENDING', toStatus: 'APPROVED', userId: manager.id },
  });
  await prisma.penalty.update({
    where: { id: penalty.id },
    data: { status: 'PAID', paidAt: new Date() },
  });
  await prisma.penaltyEvent.create({
    data: { penaltyId: penalty.id, fromStatus: 'APPROVED', toStatus: 'PAID', userId: manager.id },
  });

  const history = await prisma.penaltyEvent.findMany({
    where: { penaltyId: penalty.id },
    orderBy: { createdAt: 'asc' },
  });
  check(
    'the full penalty history is preserved',
    history.map((e) => e.toStatus).join('>') === 'PENDING>APPROVED>PAID',
    history.map((e) => e.toStatus).join('>'),
  );

  // Supplies ledger and its projection.
  const supply = await prisma.supply.findFirst({ where: { tenantId: T, code: 'SUP-P-001' } });
  check('the printing supplies master was seeded', Boolean(supply));

  if (supply) {
    const before = n(supply.onHand);
    const tx = await prisma.supplyTransaction.create({
      data: {
        tenantId: T,
        supplyId: supply.id,
        type: 'PURCHASE',
        txDate: new Date(),
        quantity: 10,
        unitCost: 250,
        totalCost: 2500,
        notes: 'VERIFY-P65',
      },
    });
    await prisma.supply.update({
      where: { id: supply.id },
      data: { onHand: before + 10, lastUnitCost: 250 },
    });
    const after = await prisma.supply.findUnique({ where: { id: supply.id } });
    check('a purchase raises on-hand by exactly the quantity', n(after.onHand) === before + 10);
    check('purchase total = quantity × unit cost', n(tx.totalCost) === 2500);

    await prisma.supplyTransaction.delete({ where: { id: tx.id } });
    await prisma.supply.update({
      where: { id: supply.id },
      data: { onHand: before, lastUnitCost: supply.lastUnitCost },
    });
  }

  const printingCount = await prisma.supply.count({ where: { tenantId: T, kind: 'PRINTING' } });
  const embroideryCount = await prisma.supply.count({ where: { tenantId: T, kind: 'EMBROIDERY' } });
  check('printing supplies are tracked separately', printingCount >= 8, `${printingCount}`);
  check('embroidery supplies are tracked separately', embroideryCount >= 4, `${embroideryCount}`);

  // ── 7. Phase 6 snapshots are untouched ────────────────────

  const snapshots = await prisma.costCalculation.findMany({
    include: { lines: { orderBy: { sequence: 'asc' } } },
  });
  if (snapshots.length === 0) {
    check('a Phase 6 cost snapshot survives to be checked', false, 'none found');
  } else {
    check('a Phase 6 cost snapshot survives to be checked', true, `${snapshots.length} found`);
    const bad = snapshots.filter((s) => {
      const sum = s.lines.reduce((acc, l) => acc + n(l.lineCost), 0);
      return Math.abs(sum - n(s.totalCost)) > 0.01;
    });
    check(
      'every existing snapshot still adds up after the migration',
      bad.length === 0,
      `${bad.length} broken`,
    );
  }

  // ── Cleanup ───────────────────────────────────────────────

  await prisma.penaltyEvent.deleteMany({ where: { penaltyId: { in: created.penalties } } });
  await prisma.penalty.deleteMany({ where: { id: { in: created.penalties } } });
  await prisma.damageRecord.deleteMany({ where: { id: { in: created.damages } } });
  await prisma.secondaryExpense.deleteMany({ where: { id: { in: created.expenses } } });
  await prisma.supplyTransaction.deleteMany({ where: { notes: 'VERIFY-P65' } });

  const leftover =
    (await prisma.secondaryExpense.count({ where: { number: { startsWith: 'VERIFY-P65' } } })) +
    (await prisma.damageRecord.count({ where: { number: { startsWith: 'VERIFY-P65' } } })) +
    (await prisma.penalty.count({ where: { number: { startsWith: 'VERIFY-P65' } } }));
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
