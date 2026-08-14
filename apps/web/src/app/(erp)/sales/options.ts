import 'server-only';

import { available, dec } from '@erp/domain';
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
      price: dec(v.sellingPrice ?? v.product.sellingPrice ?? 0).toNumber(),
      available: available(onHand, reserved).toNumber(),
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
