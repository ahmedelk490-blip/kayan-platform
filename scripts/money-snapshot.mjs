/**
 * Capture every money/quantity value as an exact string.
 *
 * Run before and after the Decimal migration and diff the two files. Values
 * are stringified rather than compared as numbers so a precision change
 * shows up rather than being masked by JS coercion.
 *
 * Usage: node scripts/money-snapshot.mjs <outfile>
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const out = process.argv[2] ?? 'data/money-snapshot.json';

const s = (v) => (v === null || v === undefined ? null : String(v));

const snapshot = {
  products: (
    await prisma.product.findMany({ orderBy: { sku: 'asc' }, select: { sku: true, cost: true, sellingPrice: true } })
  ).map((r) => ({ sku: r.sku, cost: s(r.cost), sellingPrice: s(r.sellingPrice) })),

  variants: (
    await prisma.productVariant.findMany({ orderBy: { sku: 'asc' }, select: { sku: true, cost: true, sellingPrice: true } })
  ).map((r) => ({ sku: r.sku, cost: s(r.cost), sellingPrice: s(r.sellingPrice) })),

  stock: (
    await prisma.stock.findMany({ orderBy: { id: 'asc' } })
  ).map((r) => ({
    id: r.id,
    onHand: s(r.onHand),
    reserved: s(r.reserved),
    damaged: s(r.damaged),
    minStock: s(r.minStock),
    maxStock: s(r.maxStock),
  })),

  movements: (
    await prisma.stockMovement.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, type: true, quantity: true } })
  ).map((r) => ({ id: r.id, type: r.type, quantity: s(r.quantity) })),

  quotations: (
    await prisma.quotation.findMany({ orderBy: { number: 'asc' } })
  ).map((r) => ({
    number: r.number,
    subtotal: s(r.subtotal),
    discountAmount: s(r.discountAmount),
    taxAmount: s(r.taxAmount),
    total: s(r.total),
  })),

  quotationLines: (
    await prisma.quotationLine.findMany({ orderBy: { id: 'asc' } })
  ).map((r) => ({
    id: r.id,
    quantity: s(r.quantity),
    unitPrice: s(r.unitPrice),
    taxAmount: s(r.taxAmount),
    lineTotal: s(r.lineTotal),
  })),

  orders: (
    await prisma.salesOrder.findMany({ orderBy: { number: 'asc' } })
  ).map((r) => ({
    number: r.number,
    subtotal: s(r.subtotal),
    discountAmount: s(r.discountAmount),
    taxAmount: s(r.taxAmount),
    total: s(r.total),
  })),

  orderLines: (
    await prisma.salesOrderLine.findMany({ orderBy: { id: 'asc' } })
  ).map((r) => ({
    id: r.id,
    quantity: s(r.quantity),
    unitPrice: s(r.unitPrice),
    taxAmount: s(r.taxAmount),
    lineTotal: s(r.lineTotal),
  })),
};

writeFileSync(out, JSON.stringify(snapshot, null, 2), 'utf8');

const counts = Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length]));
console.log(`snapshot -> ${out}`);
console.log(counts);

await prisma.$disconnect();
