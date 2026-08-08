/**
 * Give every product at least one stockable variant.
 *
 * Stock is tracked at the variant level, so a product with no variant cannot
 * hold stock at all. The Drive import carries no colour or size information,
 * and inventing a colour/size matrix would be fabricating catalogue data —
 * so each product gets ONE default variant with colour and size null.
 *
 * That is a real modelling position, not a placeholder: a product sold in a
 * single make has exactly one stockable unit. The manager adds real
 * colour/size variants through the UI, and this default stays as the base.
 *
 * Idempotent — skips any product that already has a variant.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { isDeleted: false },
    include: { _count: { select: { variants: true } }, images: { orderBy: { sortOrder: 'asc' } } },
  });

  let created = 0;
  let linkedImages = 0;
  let skipped = 0;

  for (const product of products) {
    if (product._count.variants > 0) {
      skipped += 1;
      continue;
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `${product.sku}-DEF`,
        barcode: product.barcode,
        cost: product.cost,
        sellingPrice: product.sellingPrice,
      },
    });
    created += 1;

    // Attach the product's images to its only variant, so variant-level
    // imagery is populated rather than left theoretical.
    if (product.images.length > 0) {
      const result = await prisma.productImage.updateMany({
        where: { productId: product.id, variantId: null },
        data: { variantId: variant.id },
      });
      linkedImages += result.count;
    }
  }

  console.log({ productsScanned: products.length, variantsCreated: created, skipped, linkedImages });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
