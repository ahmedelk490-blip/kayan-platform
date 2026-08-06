import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = await prisma.category.findMany({
  include: { products: { include: { images: true } } },
  orderBy: { sortOrder: 'asc' },
});

let products = 0;
let images = 0;
let bytes = 0;

console.log('category          products  images   size');
console.log('------------------------------------------');
for (const c of categories) {
  const ci = c.products.flatMap((p) => p.images);
  const cb = ci.reduce((sum, i) => sum + i.bytes, 0);
  products += c.products.length;
  images += ci.length;
  bytes += cb;
  console.log(
    `${c.slug.padEnd(16)}  ${String(c.products.length).padStart(8)}  ${String(ci.length).padStart(6)}   ${(cb / 1024 / 1024).toFixed(1)} MB`,
  );
}
console.log('------------------------------------------');
console.log(`${'TOTAL'.padEnd(16)}  ${String(products).padStart(8)}  ${String(images).padStart(6)}   ${(bytes / 1024 / 1024).toFixed(1)} MB`);

const avg = images ? bytes / images / 1024 : 0;
console.log(`\naverage image: ${avg.toFixed(0)} KB (was ~2000 KB as PNG)`);

console.log('\nsample products:');
for (const c of categories) {
  for (const p of c.products.slice(0, 1)) {
    console.log(`  ${p.sku.padEnd(18)} ${p.nameAr}  (${p.images.length} صورة)`);
  }
}

await prisma.$disconnect();
