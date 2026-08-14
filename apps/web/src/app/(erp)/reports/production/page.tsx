import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatQty,
  formatMoney,
  throughput,
  periodRange,
  isPeriod,
  total,
  dec,
  PRODUCTION_STATUS_AR,
  PRODUCTION_STATUSES,
  type Period,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { PeriodTabs, Figure, Empty, Bar } from '../Shell';

export const metadata: Metadata = { title: 'إنتاجية التصنيع' };

export default async function ProductionReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const raw = Array.isArray(params.period) ? params.period[0] : params.period;
  const period: Period = raw && isPeriod(raw) ? raw : 'YEAR';
  const { from, to } = periodRange(period);

  const [orders, damage] = await Promise.all([
    prisma.productionOrder.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, createdAt: { gte: from, lte: to } },
      select: {
        status: true,
        quantity: true,
        startedAt: true,
        completedAt: true,
        estimatedCost: true,
        actualCost: true,
      },
    }),
    prisma.damageRecord.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        damageDate: { gte: from, lte: to },
      },
      select: { quantity: true, totalCost: true },
    }),
  ]);

  const flow = throughput(orders);
  const estimated = total(orders.map((o) => o.estimatedCost ?? 0).filter((v) => dec(v).gt(0)));
  const damageCost = total(damage.map((d) => d.totalCost));
  const damageQty = total(damage.map((d) => d.quantity));

  const peakOrders = Math.max(
    1,
    ...PRODUCTION_STATUSES.map((s) => flow.byStatus[s]?.orders ?? 0),
  );

  return (
    <AppShell user={user} title="إنتاجية التصنيع">
      <ModuleHeader
        title="إنتاجية التصنيع"
        action={
          <Link href="/reports" className="erp-btn-ghost">
            كل التقارير
          </Link>
        }
      />

      <PeriodTabs basePath="/reports/production" active={period} />

      {orders.length === 0 ? (
        <Empty what="أوامر إنتاج" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="أوامر الإنتاج" value={String(orders.length)} strong />
            <Figure
              label="مكتملة"
              value={String(flow.completedOrders)}
              hint={`${formatQty(flow.completedQuantity)} قطعة`}
              strong
            />
            <Figure
              label="متوسط زمن الدورة"
              value={flow.averageDays === null ? '—' : `${flow.averageDays} يوم`}
              hint={
                flow.averageDays === null
                  ? 'لم يكتمل أمر سجّل بدايةً ونهايةً بعد'
                  : 'من بدء التنفيذ حتى الإتمام'
              }
            />
            <Figure
              label="تكلفة الهالك المعتمد"
              value={formatMoney(damageCost.value)}
              hint={`${formatQty(damageQty.value)} قطعة تالفة`}
              tone={dec(damageCost.value).gt(0) ? 'bad' : undefined}
            />
          </div>

          <section className="erp-card mb-8 p-6">
            <h3 className="mb-4 text-sm font-semibold text-brand">التوزيع حسب الحالة</h3>
            {PRODUCTION_STATUSES.map((status) => {
              const bucket = flow.byStatus[status];
              return (
                <Bar
                  key={status}
                  label={PRODUCTION_STATUS_AR[status]}
                  value={bucket ? `${bucket.orders} · ${formatQty(bucket.quantity)}` : '—'}
                  percent={((bucket?.orders ?? 0) / peakOrders) * 100}
                />
              );
            })}
            <p className="mt-3 text-[0.7rem] text-txt-4">
              الرقمان: عدد الأوامر ثم إجمالي الكميات.
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">التكلفة</h3>
            <Table headers={['البند', 'القيمة']} empty={false}>
              <tr>
                <td className="px-4 py-3 text-txt-2">أوامر لها تكلفة تقديرية محسوبة</td>
                <td className="tnum px-4 py-3 text-txt">
                  {estimated.count} من {orders.length}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-txt-2">إجمالي التكلفة التقديرية</td>
                <td className="tnum px-4 py-3 text-txt">{formatMoney(estimated.value)}</td>
              </tr>
            </Table>
            {estimated.count < orders.length && (
              <p className="mt-2 text-[0.7rem] text-txt-4">
                الأوامر التي لم تُحسب تكلفتها غير مشمولة في الإجمالي. ولن تكون التكلفة ذات
                معنى حتى تُدخل أسعار المعادلات — الاستهلاك مضبوط والأسعار صفر.
              </p>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
