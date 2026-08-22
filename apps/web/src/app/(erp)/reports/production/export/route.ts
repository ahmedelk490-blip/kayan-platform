import { dec, isPeriod, periodRange, PRODUCTION_STATUS_AR, type Period } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';

export const dynamic = 'force-dynamic';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

/** تصدير أوامر التصنيع للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const raw = new URL(request.url).searchParams.get('period');
  const period: Period = raw && isPeriod(raw) ? raw : 'YEAR';
  const { from, to } = periodRange(period);

  const orders = await withTenant(user.tenantId, (tx) =>
    tx.productionOrder.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
      select: {
        number: true,
        status: true,
        quantity: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        estimatedCost: true,
        actualCost: true,
        product: { select: { nameAr: true } },
      },
    }),
  );

  const headers = [
    'رقم الأمر', 'المنتج', 'الحالة', 'الكمية',
    'تاريخ الإنشاء', 'بدأ في', 'اكتمل في', 'التكلفة المقدَّرة', 'التكلفة الفعلية',
  ];
  const rows = orders.map((o) => [
    o.number,
    o.product?.nameAr ?? '',
    PRODUCTION_STATUS_AR[o.status as keyof typeof PRODUCTION_STATUS_AR] ?? o.status,
    dec(o.quantity).toNumber(),
    day(o.createdAt),
    day(o.startedAt),
    day(o.completedAt),
    o.estimatedCost === null ? '' : dec(o.estimatedCost).toNumber(),
    o.actualCost === null ? '' : dec(o.actualCost).toNumber(),
  ]);

  return csvResponse(stampedName('kayan-production'), headers, rows);
}
