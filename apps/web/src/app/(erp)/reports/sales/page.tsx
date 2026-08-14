import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatMoney,
  periodRange,
  isPeriod,
  total,
  isEmpty,
  average,
  monthlySeries,
  seriesPeak,
  dec,
  balance,
  RECEIVABLE_STATUSES,
  type Period,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { PeriodTabs, Figure, Empty, Bar } from '../Shell';

export const metadata: Metadata = { title: 'تقرير المبيعات' };

export default async function SalesReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const raw = Array.isArray(params.period) ? params.period[0] : params.period;
  const period: Period = raw && isPeriod(raw) ? raw : 'YEAR';
  const { from, to } = periodRange(period);

  const [orders, invoices, receivable] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { not: 'CANCELLED' },
        orderDate: { gte: from, lte: to },
      },
      select: { total: true, orderDate: true, status: true },
    }),
    // Issued invoices are the money actually claimed; orders are intent.
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { notIn: ['DRAFT', 'VOID'] },
        issueDate: { gte: from, lte: to },
      },
      select: { total: true, paidAmount: true, issueDate: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
      select: { total: true, paidAmount: true },
    }),
  ]);

  const orderTotal = total(orders.map((o) => o.total));
  const invoiceTotal = total(invoices.map((i) => i.total));
  const collected = total(invoices.map((i) => i.paidAmount));
  const outstanding = receivable.reduce((s, i) => s.plus(balance(i.total, i.paidAmount)), dec(0));

  const series = monthlySeries(
    invoices.map((i) => ({ date: i.issueDate as Date, amount: i.total })),
    from,
    to,
  );
  const peak = seriesPeak(series);
  const meanOrder = average(orderTotal);

  return (
    <AppShell user={user} title="تقرير المبيعات">
      <ModuleHeader
        title="المبيعات"
        action={
          <Link href="/reports" className="erp-btn-ghost">
            كل التقارير
          </Link>
        }
      />

      <PeriodTabs basePath="/reports/sales" active={period} />

      {isEmpty(orderTotal) && isEmpty(invoiceTotal) ? (
        <Empty what="مبيعات" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure
              label="أوامر البيع"
              value={formatMoney(orderTotal.value)}
              hint={`${orderTotal.count} أمر`}
              strong
            />
            <Figure
              label="الفواتير الصادرة"
              value={formatMoney(invoiceTotal.value)}
              hint={`${invoiceTotal.count} فاتورة`}
              strong
            />
            <Figure
              label="المحصَّل"
              value={formatMoney(collected.value)}
              hint="من الفواتير الصادرة في الفترة"
            />
            <Figure
              label="المستحق حالياً"
              value={formatMoney(outstanding)}
              hint="كل الفترات، غير مقيّد بالفلتر"
              tone={dec(outstanding).gt(0) ? 'warn' : undefined}
            />
          </div>

          <section className="erp-card mb-8 p-6">
            <h3 className="mb-4 text-sm font-semibold text-brand">الفواتير شهرياً</h3>
            {series.every((p) => p.count === 0) ? (
              <p className="text-sm text-txt-3">لا فواتير صادرة في هذه الفترة.</p>
            ) : (
              <div>
                {series.map((point) => (
                  <Bar
                    key={point.key}
                    label={point.key}
                    value={point.count === 0 ? '—' : formatMoney(point.value)}
                    percent={dec(point.value).dividedBy(peak).times(100).toNumber()}
                  />
                ))}
                <p className="mt-3 text-[0.7rem] text-txt-4">
                  الشهور الفارغة معروضة بشرطة لا بصفر — الفجوة في العمل يجب أن تُرى.
                </p>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">ملخّص</h3>
            <Table headers={['البند', 'القيمة']} empty={false}>
              <tr>
                <td className="px-4 py-3 text-txt-2">متوسط قيمة أمر البيع</td>
                <td className="tnum px-4 py-3 text-txt">
                  {meanOrder === null ? '—' : formatMoney(meanOrder)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-txt-2">نسبة التحصيل من المُفوتَر</td>
                <td className="tnum px-4 py-3 text-txt">
                  {dec(invoiceTotal.value).lte(0)
                    ? '—'
                    : `${dec(collected.value).dividedBy(invoiceTotal.value).times(100).toFixed(1)}٪`}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-txt-2">أوامر لم تُفوتَر بعد</td>
                <td className="tnum px-4 py-3 text-txt">
                  {Math.max(orderTotal.count - invoiceTotal.count, 0)}
                </td>
              </tr>
            </Table>
          </section>
        </>
      )}
    </AppShell>
  );
}
