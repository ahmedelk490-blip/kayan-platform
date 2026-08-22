import { available, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';

export const dynamic = 'force-dynamic';

/** تصدير أرصدة المخزون بالتكلفة إلى شيت Excel (CSV). */
export async function GET() {
  const user = await requirePermission('reports.view');

  const stock = await withTenant(user.tenantId, (tx) =>
    tx.stock.findMany({
      where: { warehouse: { tenantId: user.tenantId, isDeleted: false } },
      include: {
        warehouse: { select: { nameAr: true } },
        variant: {
          include: {
            product: { select: { nameAr: true, cost: true } },
            color: { select: { nameAr: true } },
            size: { select: { code: true } },
          },
        },
      },
    }),
  );

  const headers = ['المنتج', 'اللون', 'المقاس', 'المخزن', 'الرصيد', 'محجوز', 'المتاح', 'تكلفة الوحدة', 'القيمة'];
  const rows = stock.map((s) => {
    const cost = s.variant.cost ?? s.variant.product.cost ?? null;
    return [
      s.variant.product.nameAr,
      s.variant.color?.nameAr ?? '',
      s.variant.size?.code ?? '',
      s.warehouse.nameAr,
      dec(s.onHand).toNumber(),
      dec(s.reserved).toNumber(),
      available(s.onHand, s.reserved).toNumber(),
      cost === null ? '' : dec(cost).toNumber(),
      cost === null ? '' : dec(s.onHand).times(dec(cost)).toNumber(),
    ];
  });

  return csvResponse(stampedName('kayan-inventory'), headers, rows);
}
