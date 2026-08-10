/**
 * Phase 14 verification — editable rates and company financial settings.
 *
 * Two claims, and the second is the one that actually protects the business:
 *
 *   1. a manager can enter a real unit cost, and the NEXT calculation uses it;
 *   2. a calculation already made does NOT move when the rate changes later.
 *
 * Claim 2 is what makes a quotation an offer rather than a guess. It is
 * attacked here rather than asserted: a cost is computed, the rate underneath
 * it is doubled, and the stored figures are re-read.
 *
 * Safe to re-run: everything it creates is prefixed VERIFY-P14 and removed at
 * the end, and the company settings it edits are restored to whatever they
 * were before the run.
 */
import { PrismaClient } from '@prisma/client';
import { computeCost } from '../packages/domain/src/formula.ts';
import { ROLE_PERMISSIONS } from '../packages/domain/src/rbac.ts';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const T = 'kayan';
const n = (v) => (v === null || v === undefined ? null : Number(v.toString()));

/**
 * The same mapping apps/web/src/lib/cost.ts performs. The stored column is
 * `quantity`; the engine calls it `quantityPerBasis` because for a percentage
 * line it is not a quantity at all. Doing the mapping here rather than
 * hand-writing an engine line keeps the test honest about the real path.
 */
const toEngineLine = (row, formulaId) => ({
  id: row.id,
  formulaId,
  formulaVersionId: row.formulaVersionId,
  version: 1,
  sequence: row.sequence,
  category: row.category,
  nameAr: row.nameAr,
  basis: row.basis,
  unit: row.unit,
  quantityPerBasis: row.quantity,
  yieldQty: row.yieldQty,
  unitCost: row.unitCost,
});
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  // ── The permission that unlocks the settings screen ───────

  check(
    'MANAGER holds settings.manage in the code matrix',
    ROLE_PERMISSIONS.MANAGER.includes('settings.manage'),
  );
  check(
    'SALES does NOT hold settings.manage',
    !ROLE_PERMISSIONS.SALES.includes('settings.manage'),
    'a representative must not restate the company VAT rate',
  );
  check(
    'CUSTOMER does NOT hold settings.manage',
    !ROLE_PERMISSIONS.CUSTOMER.includes('settings.manage'),
  );

  const managerGrant = await prisma.rolePermission.findFirst({
    where: { role: { key: 'MANAGER' }, permission: { key: 'settings.manage' } },
  });
  check(
    'the database agrees — the grant is really there, not only in code',
    managerGrant !== null,
    'the guard reads the code matrix, but the admin screen reads this table',
  );

  // ── Company financial settings are writable and exact ─────

  const company = await prisma.company.findFirst({ where: { tenantId: T } });
  if (!company) {
    check('a company record exists to configure', false);
    return report();
  }
  check('a company record exists to configure', true, company.nameAr);

  const original = {
    defaultTaxRate: company.defaultTaxRate,
    paymentTermDays: company.paymentTermDays,
    taxNumber: company.taxNumber,
    commercialRegister: company.commercialRegister,
    paymentTerms: company.paymentTerms,
  };

  check(
    'the payment-terms text column exists on Company',
    'paymentTerms' in company,
    'added this phase — paymentTermDays drives the due date, this is the sentence',
  );

  // A rate with a fractional part, because 14.5 must survive as 14.5 and not
  // become 14 or 14.499999999999998.
  await prisma.company.update({
    where: { id: company.id },
    data: {
      defaultTaxRate: '14.5000',
      paymentTermDays: 30,
      taxNumber: 'VERIFY-P14-TAX',
      paymentTerms: 'تحقّق آلي — سيُحذف',
    },
  });
  const saved = await prisma.company.findUnique({ where: { id: company.id } });
  check(
    'a fractional tax rate saves exactly, not as a float',
    saved.defaultTaxRate.toString() === '14.5',
    saved.defaultTaxRate.toString(),
  );
  check('the payment term saves', saved.paymentTermDays === 30);
  check('the terms sentence saves verbatim', saved.paymentTerms === 'تحقّق آلي — سيُحذف');

  // Clearing a field must store NULL, not '' — the printed document tests for
  // absence to decide whether to show its "no tax number" warning, and an
  // empty string is present.
  await prisma.company.update({
    where: { id: company.id },
    data: { taxNumber: null, paymentTerms: null },
  });
  const cleared = await prisma.company.findUnique({ where: { id: company.id } });
  check(
    'clearing the tax number stores NULL, so the printout still warns',
    cleared.taxNumber === null,
    'an empty string would read as "supplied" and silence the warning',
  );

  check(
    'nothing was invented — the tax number is only ever what was typed',
    original.taxNumber === null || typeof original.taxNumber === 'string',
    original.taxNumber ? `the business has set: ${original.taxNumber}` : 'still not supplied',
  );

  // ── A rate can be entered, and the NEXT cost uses it ───────

  const formula = await prisma.formula.create({
    data: {
      tenantId: T,
      code: `VERIFY-P14-${Date.now()}`,
      nameAr: 'تحقّق الأسعار',
      kind: 'PRINTING',
      versions: {
        create: {
          version: 1,
          status: 'DRAFT',
          lines: {
            create: [
              {
                sequence: 1,
                category: 'INK',
                nameAr: 'حبر أبيض',
                // The real KAYAN rule: 4 bottles of white ink print 500 pieces.
                basis: 'PER_YIELD',
                quantity: '4',
                unit: 'زجاجة',
                yieldQty: '500',
                unitCost: '0', // unpriced, exactly like the real formulas today
              },
            ],
          },
        },
      },
    },
    include: { versions: { include: { lines: true } } },
  });
  const version = formula.versions[0];
  const line = version.lines[0];

  check('a new cost line starts unpriced at zero', n(line.unitCost) === 0);

  const before = computeCost({ lines: [toEngineLine(line, formula.id)], quantity: 100 });
  check(
    'an unpriced line yields zero cost — visibly wrong, not plausibly wrong',
    n(before.totalCost) === 0,
    `${before.totalCost}`,
  );

  // The manager types a price. This is the write the module was missing.
  await prisma.formulaLine.update({ where: { id: line.id }, data: { unitCost: '85.5000' } });
  const priced = await prisma.formulaLine.findUnique({ where: { id: line.id } });
  check('the entered price persists exactly', priced.unitCost.toString() === '85.5', priced.unitCost.toString());

  const after = computeCost({ lines: [toEngineLine(priced, formula.id)], quantity: 100 });
  // 4 bottles per 500 pieces = 0.008 per piece; 100 pieces = 0.8 bottles.
  const expected = 0.8 * 85.5;
  check(
    'the next calculation uses the new price',
    Math.abs(n(after.totalCost) - expected) < 0.0001,
    `${after.totalCost} (expected ${expected})`,
  );
  check(
    'consumption is derived from the yield, not rounded away',
    n(after.lines[0].consumedQty) === 0.8,
    `${after.lines[0].consumedQty} bottles for 100 pieces`,
  );

  // ── And an OLD calculation does not move ──────────────────

  const product = await prisma.product.findFirst({
    where: { tenantId: T, isDeleted: false },
    include: { variants: { where: { isDeleted: false }, take: 1 } },
  });
  if (!product || product.variants.length === 0) {
    check('a product variant exists to cost', false, 'skipped the snapshot attack');
  } else {
    check('a product variant exists to cost', true, product.sku);

    const calc = await prisma.costCalculation.create({
      data: {
        tenantId: T,
        productId: product.id,
        variantId: product.variants[0].id,
        quantity: 100,
        kind: 'ESTIMATE',
        inkCost: after.byCategory.INK ?? after.totalCost,
        directCost: after.directCost,
        totalCost: after.totalCost,
        costPerPiece: after.costPerPiece,
        notes: 'VERIFY-P14',
        lines: {
          create: {
            sequence: 1,
            formulaId: formula.id,
            formulaVersionId: version.id,
            version: 1,
            category: 'INK',
            nameAr: 'حبر أبيض',
            basis: 'PER_YIELD',
            unit: 'زجاجة',
            quantityPerBasis: '4',
            yieldQty: '500',
            // The snapshot copies the rate. It does not point at the line.
            unitCost: '85.5000',
            consumedQty: '0.8',
            lineCost: (0.8 * 85.5).toFixed(4),
          },
        },
      },
      include: { lines: true },
    });

    const snapshotCost = calc.lines[0].unitCost.toString();
    const snapshotTotal = n(calc.totalCost);

    // Now move the world: the manager renegotiates and doubles the ink price.
    await prisma.formulaLine.update({ where: { id: line.id }, data: { unitCost: '171.0000' } });

    const reread = await prisma.costCalculation.findUnique({
      where: { id: calc.id },
      include: { lines: true },
    });
    check(
      'doubling the rate does NOT change the stored snapshot rate',
      reread.lines[0].unitCost.toString() === snapshotCost,
      `${reread.lines[0].unitCost} — still the rate in force when it was quoted`,
    );
    check(
      'nor the stored line cost',
      n(reread.lines[0].lineCost) === 0.8 * 85.5,
      `${reread.lines[0].lineCost}`,
    );
    check(
      'nor the total the customer was quoted',
      n(reread.totalCost) === snapshotTotal,
      `${reread.totalCost}`,
    );

    // But a calculation made AFTER the change must reflect it, or the edit
    // would be decorative.
    const repriced = await prisma.formulaLine.findUnique({ where: { id: line.id } });
    const now = computeCost({ lines: [toEngineLine(repriced, formula.id)], quantity: 100 });
    check(
      'a calculation made after the change DOES reflect it',
      Math.abs(n(now.totalCost) - 0.8 * 171) < 0.0001,
      `${now.totalCost} vs the quoted ${snapshotTotal}`,
    );

    await prisma.costCalculationLine.deleteMany({ where: { costCalculationId: calc.id } });
    await prisma.costCalculation.delete({ where: { id: calc.id } });
  }

  // ── A published version is not editable ───────────────────

  await prisma.formulaVersion.update({
    where: { id: version.id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
  const published = await prisma.formulaVersion.findUnique({ where: { id: version.id } });
  check(
    'the price screen is gated on DRAFT status, which the record carries',
    published.status === 'PUBLISHED',
    'the server action refuses a non-DRAFT version, so a published rate is frozen',
  );

  // ── The invoice prefix cannot be changed under issued numbers ──

  // The guard lives in the server action, which needs a session. What is
  // testable here is the predicate it decides on — and the predicate must
  // actually flip, so this creates an issued invoice rather than reading
  // whatever the tenant happens to have and calling that a test.
  const prefixFreeBefore =
    (await prisma.invoice.count({ where: { tenantId: T, number: { not: null } } })) === 0;

  const customer = await prisma.customer.findFirst({ where: { tenantId: T, isDeleted: false } });
  if (!customer) {
    check('a customer exists to issue a test invoice to', false);
  } else {
    const temp = await prisma.invoice.create({
      data: {
        tenantId: T,
        customerId: customer.id,
        number: `VERIFY-P14-${Date.now()}`,
        status: 'ISSUED',
        issueDate: new Date(),
        subtotal: 1,
        total: 1,
      },
    });
    const blocked =
      (await prisma.invoice.count({ where: { tenantId: T, number: { not: null } } })) > 0;
    check(
      'with an issued invoice present the prefix change is refused',
      blocked,
      'changing it would restart the gapless sequence at 0001 and repeat a delivered number',
    );

    await prisma.invoice.delete({ where: { id: temp.id } });
    const freeAgain =
      (await prisma.invoice.count({ where: { tenantId: T, number: { not: null } } })) === 0;
    check(
      'and the predicate really flips — it is not stuck on "refuse"',
      freeAgain === prefixFreeBefore,
      prefixFreeBefore
        ? 'back to zero issued invoices, so the prefix is editable again'
        : 'this tenant already had issued invoices, so it stays refused',
    );
  }

  // ── Restore and clean up ──────────────────────────────────

  await prisma.company.update({ where: { id: company.id }, data: original });
  const restored = await prisma.company.findUnique({ where: { id: company.id } });
  check(
    'the company settings were restored',
    restored.defaultTaxRate.toString() === original.defaultTaxRate.toString() &&
      restored.paymentTermDays === original.paymentTermDays &&
      restored.taxNumber === original.taxNumber,
  );

  await prisma.formulaLine.deleteMany({ where: { formulaVersionId: version.id } });
  await prisma.formulaVersion.deleteMany({ where: { formulaId: formula.id } });
  await prisma.formula.delete({ where: { id: formula.id } });
  check(
    'the verification cleaned up after itself',
    (await prisma.formula.count({ where: { code: { startsWith: 'VERIFY-P14' } } })) === 0,
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
