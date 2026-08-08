import 'server-only';

import { dec } from '@erp/domain';
import { prisma } from '@/lib/prisma';

/**
 * Variants that can be produced, and confirmed sales orders a production
 * order may be attached to.
 *
 * Only orders in a live status are offered — attaching production to a
 * cancelled or already-delivered order would be a data-entry mistake the
 * form should not make possible.
 */
export async function loadManufacturingOptions(tenantId: string) {
  const [variants, salesOrders] = await Promise.all([
    prisma.productVariant.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        product: { tenantId, isDeleted: false, status: 'ACTIVE' },
      },
      include: {
        product: { select: { nameAr: true } },
        color: { select: { nameAr: true } },
        size: { select: { code: true } },
        stock: { select: { onHand: true } },
      },
      orderBy: { sku: 'asc' },
    }),
    prisma.salesOrder.findMany({
      where: {
        tenantId,
        isDeleted: false,
        status: { in: ['CONFIRMED', 'IN_PRODUCTION'] },
      },
      include: { customer: { select: { contactName: true, companyName: true } } },
      orderBy: { number: 'desc' },
    }),
  ]);

  return {
    variants: variants.map((v) => {
      const parts = [v.product.nameAr];
      if (v.color) parts.push(v.color.nameAr);
      if (v.size) parts.push(v.size.code);
      // Crosses into a client component — plain numbers, not Decimal.
      return {
        value: v.id,
        label: `${parts.join(' · ')} (${v.sku})`,
        onHand: v.stock.reduce((s, r) => s.plus(dec(r.onHand)), dec(0)).toNumber(),
      };
    }),
    salesOrders: salesOrders.map((o) => ({
      value: o.id,
      label: `${o.number} — ${o.customer.companyName ?? o.customer.contactName}`,
    })),
  };
}

export type ManufacturingOptions = Awaited<ReturnType<typeof loadManufacturingOptions>>;
