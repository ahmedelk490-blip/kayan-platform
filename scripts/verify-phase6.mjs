/**
 * Phase 6 verification against the real database.
 *
 * The claim that matters most in this phase is "changing a formula does not
 * affect old calculations". That is not asserted here — it is *attacked*:
 * a cost is calculated, the formula is then republished with different
 * numbers, and the old calculation is re-read to see whether it moved.
 *
 * Everything created is cleaned up at the end, so it is safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import {
  computeCost,
  runMinutes,
  suggestPrice,
  profit,
  COST_CATEGORIES,
  COST_BASES,
} from '../packages/domain/src/formula.ts';

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

function line(over = {}) {
  return {
    id: 'l',
    formulaId: 'f',
    formulaVersionId: 'v',
    version: 1,
    sequence: 1,
    category: 'MATERIAL',
    nameAr: 'x',
    basis: 'PER_PIECE',
    unit: 'm',
    quantityPerBasis: 1,
    unitCost: 1,
    ...over,
  };
}

async function main() {
  // ── 1. The engine, as pure arithmetic ─────────────────────

  {
    const r = computeCost({ quantity: 10, lines: [line({ quantityPerBasis: 2, unitCost: 3 })] });
    check('PER_PIECE: 10 pcs × 2 m × 3 = 60', n(r.totalCost) === 60, `${r.totalCost}`);
    check('cost per piece is 6', n(r.costPerPiece) === 6);
  }

  {
    // Setup charged once, not per piece — the whole reason long runs are
    // cheaper per unit.
    const r = computeCost({ quantity: 100, lines: [line({ basis: 'PER_ORDER', quantityPerBasis: 1, unitCost: 120 })] });
    check('PER_ORDER is charged once regardless of quantity', n(r.totalCost) === 120);
    check('PER_ORDER cost per piece falls with volume', n(r.costPerPiece) === 1.2);
  }

  {
    // A 50 m roll yielding 400 pieces = 0.125 m per piece.
    const r = computeCost({
      quantity: 400,
      lines: [line({ basis: 'PER_YIELD', quantityPerBasis: 50, yieldQty: 400, unitCost: 10 })],
    });
    check('PER_YIELD: one full roll over its full yield = 500', n(r.totalCost) === 500);
    const half = computeCost({
      quantity: 200,
      lines: [line({ basis: 'PER_YIELD', quantityPerBasis: 50, yieldQty: 400, unitCost: 10 })],
    });
    check('PER_YIELD is proportional, not rounded up to whole rolls', n(half.totalCost) === 250);
  }

  {
    const r = computeCost({
      quantity: 10,
      lines: [line({ basis: 'PER_1000_STITCHES', quantityPerBasis: 1.2, unitCost: 0.28 })],
      params: { stitchCount: 8000 },
    });
    // 8000 × 10 = 80 000 stitches = 80 thousand × 1.2 g = 96 g × 0.28
    check('PER_1000_STITCHES reads stitchCount', n(r.totalCost) === 26.88, `${r.totalCost}`);
  }

  {
    const r = computeCost({
      quantity: 10,
      lines: [line({ basis: 'PER_1000_STITCHES', quantityPerBasis: 1.2, unitCost: 0.28 })],
      params: {},
    });
    check(
      'a missing parameter costs zero rather than a guessed default',
      n(r.totalCost) === 0,
      'no invented numbers',
    );
  }

  {
    // 8000 / 700 = 11.4286 min/pc × 10 = 114.286, + 20 setup
    const m = runMinutes(10, { stitchCount: 8000, stitchesPerMinute: 700, setupMinutes: 20 });
    check('run time = stitches ÷ speed × qty + setup', Math.abs(n(m) - 134.2857) < 0.001, `${m}`);

    const explicit = runMinutes(10, { minutesPerPiece: 0.4, setupMinutes: 30 });
    check('minutesPerPiece is used when there is no stitch count', n(explicit) === 34);
  }

  {
    // Percent lines charge on the direct subtotal only, never on each other.
    const r = computeCost({
      quantity: 1,
      lines: [
        line({ sequence: 1, quantityPerBasis: 100, unitCost: 1 }),
        line({ sequence: 2, basis: 'PERCENT_OF_DIRECT', quantityPerBasis: 10, category: 'WASTE' }),
        line({ sequence: 3, basis: 'PERCENT_OF_DIRECT', quantityPerBasis: 10, category: 'OVERHEAD' }),
      ],
    });
    check('direct subtotal is 100', n(r.directCost) === 100);
    check('two 10% lines charge 10 each, not 10 then 11', n(r.indirectCost) === 20, `${r.indirectCost}`);
    check('total is 120', n(r.totalCost) === 120);
  }

  {
    // Reordering the percent lines must not change the answer.
    const base = [
      line({ sequence: 1, quantityPerBasis: 100, unitCost: 1 }),
      line({ sequence: 2, basis: 'PERCENT_OF_DIRECT', quantityPerBasis: 7, category: 'OVERHEAD' }),
      line({ sequence: 3, basis: 'PERCENT_OF_DIRECT', quantityPerBasis: 3, category: 'WASTE' }),
    ];
    const swapped = [
      line({ sequence: 1, quantityPerBasis: 100, unitCost: 1 }),
      line({ sequence: 2, basis: 'PERCENT_OF_DIRECT', quantityPerBasis: 3, category: 'WASTE' }),
      line({ sequence: 3, basis: 'PERCENT_OF_DIRECT', quantityPerBasis: 7, category: 'OVERHEAD' }),
    ];
    check(
      'row order cannot change the total',
      n(computeCost({ quantity: 1, lines: base }).totalCost) ===
        n(computeCost({ quantity: 1, lines: swapped }).totalCost),
    );
  }

  {
    const r = computeCost({
      quantity: 2,
      lines: [
        line({ sequence: 1, category: 'MATERIAL', quantityPerBasis: 1, unitCost: 10 }),
        line({ sequence: 2, category: 'INK', quantityPerBasis: 1, unitCost: 5 }),
      ],
    });
    check('categories are reported separately', n(r.byCategory.MATERIAL) === 20 && n(r.byCategory.INK) === 10);
    check(
      'every category is present in the breakdown, even at zero',
      COST_CATEGORIES.every((c) => r.byCategory[c] !== undefined),
    );
  }

  // Margin, not markup — the distinction that decides whether a quote makes
  // money.
  check('25% margin on cost 75 gives price 100', n(suggestPrice(75, 25)) === 100);
  check('a margin of 100% is unreachable and returns null', suggestPrice(50, 100) === null);
  check('no target margin means no suggested price', suggestPrice(50, null) === null);

  {
    const p = profit(100, 75);
    check('profit: 100 revenue on 75 cost is 25 at 25%', n(p.grossProfit) === 25 && n(p.marginPercent) === 25);
    check('margin on zero revenue is null, not a division by zero', profit(0, 10).marginPercent === null);
  }

  {
    // Exact decimal, not float. 0.1 + 0.2 style error would show here.
    const r = computeCost({
      quantity: 3,
      lines: [line({ quantityPerBasis: 1.1, unitCost: 1 })],
    });
    check('decimal arithmetic is exact (3 × 1.1 = 3.3, not 3.3000000000000003)', n(r.totalCost) === 3.3, `${r.totalCost}`);
  }

  check('all six bases are handled', COST_BASES.length === 6);

  // ── 2. RBAC ───────────────────────────────────────────────

  const perms = await prisma.permission.findMany({
    where: { OR: [{ key: { startsWith: 'formula.' } }, { key: { startsWith: 'cost.' } }] },
    select: { key: true },
  });
  const keys = perms.map((p) => p.key).sort();
  check(
    'formula.view, formula.write, cost.view, cost.margin all exist',
    keys.join() === 'cost.margin,cost.view,formula.view,formula.write',
    keys.join(' '),
  );
  check(
    'the renamed cost.read no longer exists',
    !(await prisma.permission.findUnique({ where: { key: 'cost.read' } })),
  );
  const salesFormula = await prisma.rolePermission.count({
    where: { role: { key: 'SALES' }, permission: { key: 'formula.view' } },
  });
  check('SALES cannot read formulas', salesFormula === 0);
  const managerCount = await prisma.rolePermission.count({
    where: {
      role: { key: 'MANAGER' },
      permission: { OR: [{ key: { startsWith: 'formula.' } }, { key: { startsWith: 'cost.' } }] },
    },
  });
  check('MANAGER holds all four', managerCount === 4, `${managerCount}/4`);

  // ── 3. A real formula, end to end ─────────────────────────

  const printing = await prisma.formula.findFirst({
    where: { tenantId: T, code: 'FRM-0001' },
    include: { currentVersion: { include: { lines: true, params: true } } },
  });
  if (!printing?.currentVersion) {
    check('the seeded printing formula exists and is published', false, 'run prisma/seed-phase6.mjs');
    return report();
  }
  check('the seeded printing formula exists and is published', true);
  check('it has a published version with lines', printing.currentVersion.lines.length === 8);
  check('its version is PUBLISHED', printing.currentVersion.status === 'PUBLISHED');

  const assignment = await prisma.productFormula.findFirst({
    where: { formulaId: printing.id },
    include: { product: { include: { variants: { where: { isDeleted: false }, take: 1 } } } },
  });
  if (!assignment?.product.variants[0]) {
    check('the formula is assigned to a product with a variant', false, 'no variant to cost');
    return report();
  }
  check('the formula is assigned to a product with a variant', true);

  const product = assignment.product;
  const variant = product.variants[0];
  const created = [];

  // Cost 100 pieces through the real gather → compute → persist path, by
  // reproducing it here without the HTTP layer.
  const gathered = await gatherLike(product.id, variant.id);
  check('gathering found the published version', gathered.used.length >= 1);
  check('gathering skipped nothing unexpectedly', gathered.skipped.length === 0, JSON.stringify(gathered.skipped));

  const first = computeCost({
    quantity: 100,
    lines: gathered.lines,
    params: gathered.params,
    targetMarginPercent: 30,
  });
  check('a real formula produces a non-zero cost', n(first.totalCost) > 0, `${first.totalCost}`);
  check('the suggested price beats the cost per piece', n(first.suggestedPrice) > n(first.costPerPiece));

  const calc = await prisma.costCalculation.create({
    data: {
      tenantId: T,
      productId: product.id,
      variantId: variant.id,
      quantity: 100,
      kind: 'ESTIMATE',
      materialCost: first.byCategory.MATERIAL.toString(),
      inkCost: first.byCategory.INK.toString(),
      threadCost: first.byCategory.THREAD.toString(),
      laborCost: first.byCategory.LABOR.toString(),
      packagingCost: first.byCategory.PACKAGING.toString(),
      machineCost: first.byCategory.MACHINE.toString(),
      overheadCost: first.byCategory.OVERHEAD.toString(),
      wasteCost: first.byCategory.WASTE.toString(),
      directCost: first.directCost.toString(),
      indirectCost: first.indirectCost.toString(),
      totalCost: first.totalCost.toString(),
      costPerPiece: first.costPerPiece.toString(),
      totalMinutes: first.totalMinutes.toString(),
      targetMarginPercent: 30,
      suggestedPrice: first.suggestedPrice.toString(),
      formulas: {
        create: gathered.used.map((u) => ({
          formulaId: u.formulaId,
          formulaVersionId: u.formulaVersionId,
          version: u.version,
          formulaCode: u.formulaCode,
          formulaNameAr: u.formulaNameAr,
          kind: u.kind,
        })),
      },
      lines: {
        create: first.lines.map((l, i) => ({
          sequence: i + 1,
          formulaId: l.formulaId,
          formulaVersionId: l.formulaVersionId,
          version: l.version,
          category: l.category,
          nameAr: l.nameAr,
          basis: l.basis,
          unit: l.unit,
          quantityPerBasis: l.quantityPerBasis.toString(),
          yieldQty: l.yieldQty ? l.yieldQty.toString() : null,
          unitCost: l.unitCost.toString(),
          consumedQty: l.consumedQty.toString(),
          lineCost: l.lineCost.toString(),
        })),
      },
    },
    include: { lines: true, formulas: true },
  });
  created.push(calc.id);

  check('the snapshot stored every line', calc.lines.length === first.lines.length);
  check('the snapshot records which formula version produced it', calc.formulas.length >= 1);
  check(
    'the snapshot line totals add up to the stored total',
    Math.abs(calc.lines.reduce((s, l) => s + n(l.lineCost), 0) - n(calc.totalCost)) < 0.01,
  );
  check(
    'the eight buckets add up to the stored total',
    Math.abs(
      n(calc.materialCost) + n(calc.inkCost) + n(calc.threadCost) + n(calc.laborCost) +
        n(calc.packagingCost) + n(calc.machineCost) + n(calc.overheadCost) + n(calc.wasteCost) -
        n(calc.totalCost),
    ) < 0.01,
  );

  const storedTotal = n(calc.totalCost);
  const storedFirstLine = n(calc.lines[0].lineCost);

  // ── 4. THE ATTACK: change the formula, re-read the old cost ──

  const v2 = await prisma.formulaVersion.create({
    data: {
      formulaId: printing.id,
      version: 999,
      status: 'DRAFT',
      lines: {
        create: printing.currentVersion.lines.map((l) => ({
          sequence: l.sequence,
          category: l.category,
          nameAr: l.nameAr,
          basis: l.basis,
          // Every unit cost doubled. If the snapshot were a live view, the
          // old calculation would now read differently.
          quantity: l.quantity,
          yieldQty: l.yieldQty,
          unit: l.unit,
          unitCost: Number(l.unitCost.toString()) * 2,
        })),
      },
      params: { create: printing.currentVersion.params.map((p) => ({ key: p.key, nameAr: p.nameAr, value: p.value, unit: p.unit })) },
    },
  });
  const previousCurrent = printing.currentVersionId;
  await prisma.formulaVersion.update({ where: { id: v2.id }, data: { status: 'PUBLISHED' } });
  await prisma.formulaVersion.update({ where: { id: previousCurrent }, data: { status: 'ARCHIVED' } });
  await prisma.formula.update({ where: { id: printing.id }, data: { currentVersionId: v2.id } });

  const reread = await prisma.costCalculation.findUnique({
    where: { id: calc.id },
    include: { lines: { orderBy: { sequence: 'asc' } } },
  });
  check(
    'republishing at double the rates does NOT move the old total',
    n(reread.totalCost) === storedTotal,
    `${storedTotal} -> ${n(reread.totalCost)}`,
  );
  check(
    'republishing does NOT move an old snapshot line',
    n(reread.lines[0].lineCost) === storedFirstLine,
  );
  check(
    'the old snapshot still points at the version it used',
    reread.lines[0].formulaVersionId === previousCurrent,
  );

  // A NEW calculation, however, must pick the new version up.
  const afterGather = await gatherLike(product.id, variant.id);
  const second = computeCost({
    quantity: 100,
    lines: afterGather.lines,
    params: afterGather.params,
  });
  check(
    'a NEW calculation does use the new version',
    n(second.totalCost) > n(first.totalCost),
    `${first.totalCost} -> ${second.totalCost}`,
  );
  check(
    'doubling every unit cost doubles the new total',
    Math.abs(n(second.totalCost) - storedTotal * 2) < 0.01,
    `${second.totalCost} vs ${storedTotal * 2}`,
  );

  // ── 5. Restore and clean up ───────────────────────────────

  await prisma.formula.update({ where: { id: printing.id }, data: { currentVersionId: previousCurrent } });
  await prisma.formulaVersion.update({ where: { id: previousCurrent }, data: { status: 'PUBLISHED' } });
  await prisma.formulaVersion.delete({ where: { id: v2.id } });
  await prisma.costCalculation.deleteMany({ where: { id: { in: created } } });

  const leftoverVersions = await prisma.formulaVersion.count({ where: { version: 999 } });
  const restored = await prisma.formula.findUnique({ where: { id: printing.id } });
  check('the verification cleaned up after itself', leftoverVersions === 0);
  check('the formula was restored to its original published version', restored.currentVersionId === previousCurrent);

  report();
}

/** Mirrors lib/cost.ts gatherFormulas, without the Next.js import chain. */
async function gatherLike(productId, variantId) {
  const assignments = await prisma.productFormula.findMany({
    where: { productId, OR: [{ variantId: null }, { variantId }], formula: { isDeleted: false } },
    include: {
      formula: {
        include: { currentVersion: { include: { lines: { orderBy: { sequence: 'asc' } }, params: true } } },
      },
    },
    orderBy: { formula: { code: 'asc' } },
  });

  const lines = [];
  const params = {};
  const used = [];
  const skipped = [];

  assignments.forEach((a, index) => {
    const f = a.formula;
    const v = f.currentVersion;
    if (!v || v.status !== 'PUBLISHED') {
      skipped.push({ code: f.code, reason: 'no published version' });
      return;
    }
    used.push({
      formulaId: f.id,
      formulaVersionId: v.id,
      version: v.version,
      formulaCode: f.code,
      formulaNameAr: f.nameAr,
      kind: f.kind,
    });
    for (const p of v.params) params[p.key] = Number(p.value.toString());
    for (const l of v.lines) {
      lines.push({
        id: l.id,
        formulaId: f.id,
        formulaVersionId: v.id,
        version: v.version,
        sequence: index * 1000 + l.sequence,
        category: l.category,
        nameAr: l.nameAr,
        basis: l.basis,
        unit: l.unit,
        quantityPerBasis: l.quantity,
        yieldQty: l.yieldQty,
        unitCost: l.unitCost,
      });
    }
  });

  return { lines, params, used, skipped };
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
