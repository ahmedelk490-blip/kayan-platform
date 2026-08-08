import 'server-only';

import { available } from '@erp/domain';
import { prisma } from '@/lib/prisma';
import type { VariantOption } from './DocumentForm';

/** Customers and sellable variants, with available-to-promise per variant. */
export async function loadSalesOptions(tenantId: string) {
  const [customers, variants] = await Promise.all([
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
        product: { select: { nameAr: true, sellingPrice: true } },
        color: { select: { nameAr: true } },
        size: { select: { code: true } },
        stock: { select: { onHand: true, reserved: true } },
      },
      orderBy: { sku: 'asc' },
    }),
  ]);

  const variantOptions: VariantOption[] = variants.map((v) => {
    const onHand = v.stock.reduce((s, r) => s + r.onHand, 0);
    const reserved = v.stock.reduce((s, r) => s + r.reserved, 0);
    const parts = [v.product.nameAr];
    if (v.color) parts.push(v.color.nameAr);
    if (v.size) parts.push(v.size.code);
    return {
      value: v.id,
      label: `${parts.join(' · ')} (${v.sku})`,
      price: v.sellingPrice ?? v.product.sellingPrice ?? 0,
      available: available(onHand, reserved),
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
