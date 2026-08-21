import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma, type tenantTransaction } from '@/lib/prisma';

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

// Derived from tenantTransaction rather than from prisma.$transaction: since
// Phase 7 the callers open transactions through that helper, which hands back
// a plain client with the tenant already declared on the connection.
type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

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
/** Quantities arrive as Prisma.Decimal; only their identity matters here. */
interface OrderForReservation {
  id: string;
  tenantId: string;
  lines: {
    id: string;
    productId: string;
    variantId: string;
    quantity: Prisma.Decimal;
  }[];
}

export async function reserveForOrder(
  tx: Tx,
  order: OrderForReservation,
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
  order: OrderForReservation,
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
        quantity: reserve.quantity.negated(),
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
        data: { reserved: { increment: reserve.quantity.negated() } },
      });
    }

    created += 1;
  }

  return { created, skipped };
}

/**
 * صرف المخزون فعلياً عند تسليم الأمر.
 *
 * الحجز يرفع `reserved` ولا يمسّ `onHand` — البضاعة ما زالت موجودة. التسليم
 * يخرجها فعلاً: يُنقص `onHand` بالكمية، ويُنقص `reserved` بها أيضاً لأن
 * الحجز تحوّل إلى خروج حقيقي. المحصّلة على المتاح (onHand − reserved) صفر،
 * لكن الرصيد الفعلي ينخفض — وهو ما كان ناقصاً: المخزن «يسمع» الأمر ويتخصّم.
 *
 * IDEMPOTENT كأخواتها: القيد الفريد (salesOrderLineId, ISSUE) يمنع صرفاً
 * مزدوجاً، والدالة تتخطّى ما صُرف سلفاً فلا تصل للقيد في الحالة الشائعة.
 *
 * يُسمح بأن يهبط onHand تحت الصفر: التسليم واقعة حدثت فعلاً، ورصيد سالب
 * يكشف بيعاً بأكثر من الموجود بدل أن يخفيه بمنع الحركة.
 */
export async function issueForOrder(
  tx: Tx,
  order: OrderForReservation,
  userId: string | null,
): Promise<ReservationResult> {
  let created = 0;
  let skipped = 0;

  for (const line of order.lines) {
    const already = await tx.stockMovement.findFirst({
      where: { salesOrderLineId: line.id, type: 'ISSUE' },
    });
    if (already) {
      skipped += 1;
      continue;
    }

    // مخزن الصرف هو مخزن الحجز. لا حجز يعني أمراً لم يُؤكَّد — لا يُصرف منه.
    const reserve = await tx.stockMovement.findFirst({
      where: { salesOrderLineId: line.id, type: 'RESERVE' },
    });
    const warehouseId = reserve?.warehouseId;
    if (!warehouseId) {
      skipped += 1;
      continue;
    }

    await tx.stockMovement.create({
      data: {
        tenantId: order.tenantId,
        productId: line.productId,
        variantId: line.variantId,
        warehouseId,
        type: 'ISSUE',
        quantity: line.quantity.negated(),
        reference: order.id,
        reason: 'صرف مخزون — تسليم أمر بيع',
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
        data: {
          onHand: { increment: line.quantity.negated() },
          reserved: { increment: line.quantity.negated() },
        },
      });
    }

    created += 1;
  }

  return { created, skipped };
}

export { defaultWarehouseId };
