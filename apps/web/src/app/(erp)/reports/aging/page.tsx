import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatMoney,
  dec,
  balance,
  daysOverdue,
  ageingBucket,
  ageingTotals,
  AGEING_BUCKETS,
  AGEING_BUCKET_AR,
  RECEIVABLE_STATUSES,
  type AgeingBucket,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { Figure, Empty } from '../Shell';
import { ReportTabs } from '../ReportTabs';

export const metadata: Metadata = { title: 'تقدّم الديون' };

/**
 * تقدّم الديون (أعمار الديون) — الفواتير غير المسدّدة موزّعة حسب مدى تأخّرها.
 *
 * صورة لحظية للوضع الحالي، لا فترة — الدَّين موقف لا تدفّق. كل فاتورة في
 * دلوها حسب أيام تأخّرها عن الاستحقاق.
 */
export default async function AgingReport() {
  const user = await requirePermission('reports.view');
  const now = new Date();

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
    select: {
      id: true, number: true, total: true, paidAmount: true, dueDate: true,
      customer: { select: { contactName: true, companyName: true } },
    },
  });

  const rows = invoices
    .map((i) => {
      const outstanding = balance(i.total, i.paidAmount);
      const days = daysOverdue(i.dueDate, outstanding, now);
      return {
        id: i.id,
        number: i.number,
        name: i.customer.companyName ?? i.customer.contactName,
        due: i.dueDate,
        days,
        bucket: ageingBucket(days),
        outstanding,
      };
    })
    .filter((r) => dec(r.outstanding).gt(0))
    .sort((a, b) => b.days - a.days);

  const totals = ageingTotals(
    invoices.map((i) => ({ dueDate: i.dueDate, outstanding: balance(i.total, i.paidAmount) })),
    now,
  );
  const grand = AGEING_BUCKETS.reduce((s, b) => s.plus(totals[b]), dec(0));
  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' });

  return (
    <AppShell user={user} title="تقدّم الديون">
      <ModuleHeader
        title="تقدّم الديون"
        action={
          <div className="flex gap-2">
            <a href="/reports/aging/export" className="erp-btn-ghost">تصدير Excel</a>
            <Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>
          </div>
        }
      />

      <ReportTabs />

      {rows.length === 0 ? (
        <Empty what="ديون غير مسدّدة" />
      ) : (
        <>
          <p className="mb-4 text-xs text-txt-3">صورة لحظية للمستحقات الحالية (غير مقيّدة بفترة). الإجمالي: <span className="tnum font-semibold text-brand">{formatMoney(grand)}</span></p>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {AGEING_BUCKETS.map((b) => (
              <Figure
                key={b}
                label={AGEING_BUCKET_AR[b]}
                value={formatMoney(totals[b])}
                tone={b === 'D90_PLUS' && dec(totals[b]).gt(0) ? 'bad' : b === 'D61_90' && dec(totals[b]).gt(0) ? 'warn' : undefined}
              />
            ))}
          </div>

          <Table headers={['الفاتورة', 'العميل', 'تاريخ الاستحقاق', 'أيام التأخّر', 'المتبقّي', 'الفئة']} empty={false}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-txt" dir="ltr">{r.number ?? '—'}</td>
                <td className="px-4 py-3 text-txt-2">{r.name}</td>
                <td className="px-4 py-3 text-txt-3">{r.due ? fmt.format(r.due) : '—'}</td>
                <td className={`tnum px-4 py-3 ${r.days > 90 ? 'text-bad' : r.days > 0 ? 'text-warn' : 'text-txt-3'}`}>{r.days > 0 ? r.days : '—'}</td>
                <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(r.outstanding)}</td>
                <td className="px-4 py-3 text-txt-2">{AGEING_BUCKET_AR[r.bucket as AgeingBucket]}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </AppShell>
  );
}
