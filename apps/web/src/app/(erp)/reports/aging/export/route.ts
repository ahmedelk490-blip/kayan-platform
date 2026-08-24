import {
  dec,
  balance,
  daysOverdue,
  ageingBucket,
  AGEING_BUCKET_AR,
  RECEIVABLE_STATUSES,
  type AgeingBucket,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '../../csv';

export const dynamic = 'force-dynamic';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

/** تصدير أعمار الديون إلى شيت Excel (CSV). */
export async function GET() {
  const user = await requirePermission('reports.view');
  const now = new Date();

  const invoices = await withTenant(user.tenantId, (tx) =>
    tx.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
      select: {
        number: true, total: true, paidAmount: true, dueDate: true,
        customer: { select: { contactName: true, companyName: true } },
      },
    }),
  );

  const headers = ['الفاتورة', 'العميل', 'تاريخ الاستحقاق', 'أيام التأخّر', 'المتبقّي', 'الفئة'];
  const rows = invoices
    .map((i) => {
      const outstanding = balance(i.total, i.paidAmount);
      const days = daysOverdue(i.dueDate, outstanding, now);
      return {
        number: i.number ?? '',
        name: i.customer.companyName ?? i.customer.contactName,
        due: i.dueDate,
        days,
        bucket: ageingBucket(days) as AgeingBucket,
        outstanding: dec(outstanding).toNumber(),
      };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.days - a.days)
    .map((r) => [r.number, r.name, day(r.due), r.days, r.outstanding, AGEING_BUCKET_AR[r.bucket]]);

  return csvResponse(stampedName('kayan-aging'), headers, rows);
}
