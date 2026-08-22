import 'server-only';

import { available, dec } from '@erp/domain';
import { prisma } from '@/lib/prisma';
import type { VariantOption } from './DocumentForm';

/** Customers and sellable variants, with available-to-promise per variant. */
export async function loadSalesOptions(tenantId: string) {
  const [customers, variants, tiers] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, isDeleted: false },
      orderBy: { contactName: 'asc' },
      select: { id: true, code: true, contactName: true, companyName: true },
    }),
    prisma.productVariant.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        product: { tenantId, isDeleted: false, status: 'ACTIVE' },
      },
      include: {
        product: { select: { id: true, nameAr: true, sellingPrice: true } },
        color: { select: { nameAr: true } },
        size: { select: { code: true } },
        stock: { select: { onHand: true, reserved: true } },
      },
      orderBy: { sku: 'asc' },
    }),
    // شرائح السعر النشطة — هي السعر الحقيقي حسب الخدمة والكمية. سعر المتغيّر
    // الثابت غالباً فارغ، فالحساب بلا الشرائح يخرج صفراً.
    prisma.priceTier.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ service: 'asc' }, { minQty: 'asc' }],
      select: { productId: true, variantId: true, service: true, minQty: true, maxQty: true, price: true },
    }),
  ]);

  // شرائح كل منتج مجموعة، لتُلحق بمتغيّراته.
  const tiersByProduct = new Map<string, VariantOption['tiers']>();
  for (const t of tiers) {
    const list = tiersByProduct.get(t.productId) ?? [];
    list.push({
      service: t.service,
      minQty: t.minQty,
      maxQty: t.maxQty,
      price: dec(t.price).toNumber(),
      variantId: t.variantId,
      isActive: true,
    });
    tiersByProduct.set(t.productId, list);
  }

  const variantOptions: VariantOption[] = variants.map((v) => {
    const onHand = v.stock.reduce((s, r) => s.plus(dec(r.onHand)), dec(0));
    const reserved = v.stock.reduce((s, r) => s.plus(dec(r.reserved)), dec(0));
    const parts = [v.product.nameAr];
    if (v.color) parts.push(v.color.nameAr);
    if (v.size) parts.push(v.size.code);
    // Crosses into a client component, so plain numbers rather than Decimal
    // instances — Decimal is not serialisable across the boundary.
    return {
      value: v.id,
      label: `${parts.join(' · ')} (${v.sku})`,
      // حقول منظّمة ليبني الفورم اختياراً متسلسلاً: منتج ← لون ← مقاس.
      productId: v.product.id,
      productName: v.product.nameAr,
      colorId: v.colorId,
      colorName: v.color?.nameAr ?? null,
      sizeId: v.sizeId,
      sizeCode: v.size?.code ?? null,
      price: dec(v.sellingPrice ?? v.product.sellingPrice ?? 0).toNumber(),
      available: available(onHand, reserved).toNumber(),
      // شرائح منتج هذا المتغيّر — تلك التي بلا متغيّر (للمنتج كله) أو الخاصة
      // بهذا المتغيّر بعينه.
      tiers: (tiersByProduct.get(v.product.id) ?? []).filter(
        (t) => t.variantId === null || t.variantId === v.id,
      ),
    };
  });

  return {
    customers: customers.map((c) => ({
      value: c.id,
      label: c.companyName ? `${c.companyName} — ${c.contactName}` : c.contactName,
    })),
    variants: variantOptions,
  };
}
