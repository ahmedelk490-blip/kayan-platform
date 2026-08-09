/**
 * Phase 3 verification against the real database.
 *
 * Exercises create / read / update / soft-delete / search / sort / relations
 * / validation-invariants directly, then cleans up what it created. Nothing
 * here is mocked — it runs against data/kayan.db.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  // Tooling spans tenants, so it uses the maintenance connection. The
  // application role deliberately cannot see anything without a tenant.
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

/** Prisma returns Decimal objects; compare by value. */
const n = (v) => (v === null || v === undefined ? null : Number(v.toString()));

const T = 'kayan';
const results = [];

function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  // ── Lookups seeded ──────────────────────────────────────
  const [colors, sizes, materials, printing, embroidery, warehouses, locations] =
    await Promise.all([
      prisma.color.count({ where: { tenantId: T, isDeleted: false } }),
      prisma.size.count({ where: { tenantId: T, isDeleted: false } }),
      prisma.material.count({ where: { tenantId: T, isDeleted: false } }),
      prisma.printingOption.count({ where: { tenantId: T, isDeleted: false } }),
      prisma.embroideryOption.count({ where: { tenantId: T, isDeleted: false } }),
      prisma.warehouse.count({ where: { tenantId: T, isDeleted: false } }),
      prisma.warehouseLocation.count({ where: { isDeleted: false } }),
    ]);
  check('lookups seeded', colors >= 10 && sizes >= 7 && materials >= 6 && printing >= 5 && embroidery >= 3,
    `colors=${colors} sizes=${sizes} materials=${materials} printing=${printing} embroidery=${embroidery}`);
  check('warehouses + locations', warehouses >= 1 && locations >= 4, `wh=${warehouses} loc=${locations}`);

  // ── Variant-level stock ─────────────────────────────────
  const productsWithoutVariant = await prisma.product.count({
    where: { isDeleted: false, variants: { none: {} } },
  });
  check('every product has ≥1 variant', productsWithoutVariant === 0, `orphans=${productsWithoutVariant}`);

  const imagesOnVariants = await prisma.productImage.count({ where: { variantId: { not: null } } });
  const imagesTotal = await prisma.productImage.count();
  check('images linked to variants', imagesOnVariants === imagesTotal, `${imagesOnVariants}/${imagesTotal}`);

  // ── CRUD round trip on a real variant ───────────────────
  const category = await prisma.category.findFirst({ where: { tenantId: T, isDeleted: false } });
  const color = await prisma.color.findFirst({ where: { tenantId: T, isDeleted: false } });
  const size = await prisma.size.findFirst({ where: { tenantId: T, isDeleted: false } });
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId: T, isDeleted: false } });

  const product = await prisma.product.create({
    data: {
      tenantId: T,
      categoryId: category.id,
      sku: `VERIFY-${Date.now()}`,
      nameAr: 'منتج اختبار',
      status: 'ACTIVE',
      variants: { create: { sku: `VERIFY-${Date.now()}-A`, colorId: color.id, sizeId: size.id } },
    },
    include: { variants: true },
  });
  check('product create', Boolean(product.id));

  const variant = product.variants[0];
  check('variant carries colour + size', variant.colorId === color.id && variant.sizeId === size.id);

  // Unique (product, colour, size) must reject a duplicate combination.
  let duplicateRejected = false;
  try {
    await prisma.productVariant.create({
      data: { productId: product.id, sku: `${variant.sku}-dup`, colorId: color.id, sizeId: size.id },
    });
  } catch {
    duplicateRejected = true;
  }
  check('duplicate colour+size rejected', duplicateRejected);

  // Unique SKU across variants.
  let skuRejected = false;
  try {
    await prisma.productVariant.create({ data: { productId: product.id, sku: variant.sku } });
  } catch {
    skuRejected = true;
  }
  check('duplicate variant SKU rejected', skuRejected);

  // ── Stock movement + projection ─────────────────────────
  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: {
        tenantId: T,
        productId: product.id,
        variantId: variant.id,
        warehouseId: warehouse.id,
        type: 'RECEIPT',
        quantity: 40,
        reference: 'VERIFY',
      },
    });
    await tx.stock.create({
      data: { variantId: variant.id, warehouseId: warehouse.id, onHand: 40 },
    });
  });

  const stock = await prisma.stock.findFirst({ where: { variantId: variant.id } });
  check('stock projection written', n(stock?.onHand) === 40, `onHand=${n(stock?.onHand)}`);

  // Reversal keeps the original and links to it.
  const original = await prisma.stockMovement.findFirst({
    where: { variantId: variant.id },
    orderBy: { createdAt: 'desc' },
  });
  const reversal = await prisma.stockMovement.create({
    data: {
      tenantId: T,
      productId: product.id,
      variantId: variant.id,
      warehouseId: warehouse.id,
      type: 'REVERSAL',
      quantity: -40,
      reversesId: original.id,
    },
  });
  const originalStillThere = await prisma.stockMovement.findUnique({ where: { id: original.id } });
  check('reversal preserves the original', Boolean(originalStillThere) && reversal.reversesId === original.id);

  // One movement can only be reversed once.
  let doubleReversalRejected = false;
  try {
    await prisma.stockMovement.create({
      data: {
        tenantId: T,
        productId: product.id,
        variantId: variant.id,
        warehouseId: warehouse.id,
        type: 'REVERSAL',
        quantity: -40,
        reversesId: original.id,
      },
    });
  } catch {
    doubleReversalRejected = true;
  }
  check('double reversal rejected', doubleReversalRejected);

  // ── Search / sort ───────────────────────────────────────
  const searched = await prisma.product.findMany({
    where: { tenantId: T, isDeleted: false, nameAr: { contains: 'اختبار' } },
  });
  check('search by Arabic name', searched.length >= 1, `${searched.length} hit(s)`);

  const sorted = await prisma.product.findMany({
    where: { tenantId: T, isDeleted: false },
    orderBy: { sku: 'desc' },
    take: 3,
    select: { sku: true },
  });
  const isSorted = sorted.every((r, i) => i === 0 || sorted[i - 1].sku >= r.sku);
  check('sort desc by sku', isSorted, sorted.map((s) => s.sku).join(', '));

  // ── Soft delete keeps history ───────────────────────────
  await prisma.product.update({
    where: { id: product.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  const hidden = await prisma.product.findFirst({ where: { id: product.id, isDeleted: false } });
  const stillExists = await prisma.product.findUnique({ where: { id: product.id } });
  const movementsIntact = await prisma.stockMovement.count({ where: { productId: product.id } });
  check('soft delete hides from lists', hidden === null);
  check('soft delete keeps the row', Boolean(stillExists));
  check('soft delete keeps movement history', movementsIntact === 2, `${movementsIntact} movements`);

  // ── Cleanup ─────────────────────────────────────────────
  await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
  await prisma.stock.deleteMany({ where: { variantId: variant.id } });
  await prisma.productVariant.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

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
