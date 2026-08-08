import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * Reserved-stock integration.
 *
 * IDEMPOTENCY is the whole point of this file.
 *
 * The database enforces it: StockMovement has a unique constraint on
 * (salesOrderLineId, type), so a line can hold at most one RESERVE and one
 * UNRESERVE. Confirming an order twice cannot double-reserve, because the
 * second insert violates the constraint rather than relying on an
 * application check that a concurrent request could race past.
 *
 * These functions additionally skip work that is already done, so the
 * common case never reaches the constraint at all — but the constraint is
 * what makes the guarantee true.
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Where to reserve from. One warehouse for now; Phase 5 may allocate. */
async function defaultWarehouseId(tenantId: string): Promise<string | null> {
  const wh = await prisma.warehouse.findFirst({
    where: { tenantId, isDeleted: false },
    orderBy: { code: 'asc' },
  });
  return wh?.id ?? null;
}

export interface ReservationResult {
  created: number;
  skipped: number;
  warning?: string;
}

/**
 * Reserve stock for every line of a confirmed order.
 *
 * Reservation does NOT reduce onHand — the goods are still physically
 * present. It raises `reserved`, and available = onHand − reserved.
 */
export async function reserveForOrder(
  tx: Tx,
  order: {
    id: string;
    tenantId: string;
    lines: { id: string; productId: string; variantId: string; quantity: number }[];
  },
  userId: string | null,
  warehouseId: string,
): Promise<ReservationResult> {
  let created = 0;
  let skipped = 0;

  for (const line of order.lines) {
    const existing = await tx.stockMovement.findFirst({
      where: { salesOrderLineId: line.id, type: 'RESERVE' },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await tx.stockMovement.create({
      data: {
        tenantId: order.tenantId,
        productId: line.productId,
        variantId: line.variantId,
        warehouseId,
        type: 'RESERVE',
        quantity: line.quantity,
        reference: order.id,
        reason: 'حجز مخزون لأمر بيع مؤكَّد',
        userId,
        salesOrderId: order.id,
        salesOrderLineId: line.id,
      },
    });

    const stock = await tx.stock.findFirst({
      where: { variantId: line.variantId, warehouseId, locationId: null },
    });

    if (stock) {
      await tx.stock.update({
        where: { id: stock.id },
        data: { reserved: { increment: line.quantity } },
      });
    } else {
      await tx.stock.create({
        data: {
          variantId: line.variantId,
          warehouseId,
          onHand: 0,
          reserved: line.quantity,
        },
      });
    }

    created += 1;
  }

  return { created, skipped };
}

/**
 * Release reservations when an order is cancelled.
 *
 * Posts an UNRESERVE movement per line that still holds a reservation. The
 * original RESERVE row is never deleted — the history keeps both.
 */
export async function releaseForOrder(
  tx: Tx,
  order: {
    id: string;
    tenantId: string;
    lines: { id: string; productId: string; variantId: string; quantity: number }[];
  },
  userId: string | null,
): Promise<ReservationResult> {
  let created = 0;
  let skipped = 0;

  for (const line of order.lines) {
    const reserve = await tx.stockMovement.findFirst({
      where: { salesOrderLineId: line.id, type: 'RESERVE' },
    });
    // Nothing was ever reserved for this line.
    if (!reserve) {
      skipped += 1;
      continue;
    }

    const already = await tx.stockMovement.findFirst({
      where: { salesOrderLineId: line.id, type: 'UNRESERVE' },
    });
    if (already) {
      skipped += 1;
      continue;
    }

    await tx.stockMovement.create({
      data: {
        tenantId: order.tenantId,
        productId: line.productId,
        variantId: line.variantId,
        warehouseId: reserve.warehouseId,
        type: 'UNRESERVE',
        quantity: -reserve.quantity,
        reference: order.id,
        reason: 'إلغاء حجز — أمر بيع ملغي',
        userId,
        salesOrderId: order.id,
        salesOrderLineId: line.id,
      },
    });

    const stock = await tx.stock.findFirst({
      where: { variantId: line.variantId, warehouseId: reserve.warehouseId, locationId: null },
    });
    if (stock) {
      await tx.stock.update({
        where: { id: stock.id },
        data: { reserved: { increment: -reserve.quantity } },
      });
    }

    created += 1;
  }

  return { created, skipped };
}

export { defaultWarehouseId };
