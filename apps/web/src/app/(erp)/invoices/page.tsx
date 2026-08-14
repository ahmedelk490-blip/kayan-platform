import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  can,
  dec,
  formatMoney,
  balance,
  daysOverdue,
  ageingTotals,
  AGEING_BUCKETS,
  AGEING_BUCKET_AR,
  INVOICE_STATUSES,
  INVOICE_STATUS_AR,
  RECEIVABLE_STATUSES,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager, Badge } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';

export const metadata: Metadata = { title: 'الفواتير' };

const SORTS = [
  { value: 'createdAt', label: 'الأحدث' },
  { value: 'issueDate', label: 'تاريخ الإصدار' },
  { value: 'dueDate', label: 'تاريخ الاستحقاق' },
  { value: 'total', label: 'الإجمالي' },
];

const TONE: Record<string, 'ok' | 'bad' | 'muted'> = {
  PAID: 'ok',
  ISSUED: 'muted',
  PARTIALLY_PAID: 'muted',
  DRAFT: 'muted',
  VOID: 'bad',
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('invoices.view');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'createdAt',
    allowedSorts: SORTS.map((s) => s.value),
  });
  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;

  const where: Prisma.InvoiceWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q } },
            { customer: { contactName: { contains: query.q } } },
            { customer: { companyName: { contains: query.q } } },
          ],
        }
      : {}),
  };

  const [rows, count, receivable] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        customer: { select: { contactName: true, companyName: true } },
        _count: { select: { lines: true, payments: true } },
      },
    }),
    prisma.invoice.count({ where }),
    // Only issued and part-paid invoices are money anyone owes. A draft is
    // not a claim, and a void one never was.
    prisma.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
      select: { total: true, paidAmount: true, dueDate: true },
    }),
  ]);

  const ageing = ageingTotals(
    receivable.map((i) => ({ dueDate: i.dueDate, outstanding: balance(i.total, i.paidAmount) })),
  );
  const totalOutstanding = receivable.reduce(
    (sum, i) => sum.plus(balance(i.total, i.paidAmount)),
    dec(0),
  );

  const canWrite = can(user.role, 'invoices.write');

  return (
    <AppShell user={user} title="الفواتير">
      <ModuleHeader title="الفواتير" count={count} />

      <section className="erp-card mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-brand">أعمار الديون</h3>
          <span className="tnum text-sm text-txt">
            إجمالي المستحق: <span className="font-semibold text-brand">{formatMoney(totalOutstanding)}</span>
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {AGEING_BUCKETS.map((bucket) => (
            <div key={bucket} className="rounded-lg border border-line p-4">
              <p className="text-[0.7rem] text-txt-3">{AGEING_BUCKET_AR[bucket]}</p>
              <p
                className={`tnum mt-1 text-base ${
                  bucket === 'D90_PLUS' && dec(ageing[bucket]).gt(0) ? 'text-bad' : 'text-txt'
                }`}
              >
                {formatMoney(ageing[bucket])}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.7rem] text-txt-4">
          يُحسب التأخير من تاريخ الاستحقاق، وهو تاريخ الإصدار زائد مهلة السداد المضبوطة في
          إعدادات الشركة. المهلة الآن صفر يوم افتراضياً حتى تُحدَّد.
        </p>
      </section>

      <Toolbar placeholder="ابحث بالرقم أو العميل…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/invoices"
          className={
            statusFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {INVOICE_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/invoices?status=${s}`}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {INVOICE_STATUS_AR[s]}
          </Link>
        ))}
      </div>

      <Table
        headers={['الرقم', 'العميل', 'الإصدار', 'الاستحقاق', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => {
          const left = balance(row.total, row.paidAmount);
          const late = daysOverdue(row.dueDate, left);
          return (
            <tr key={row.id} className="hover:bg-card-2">
              <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
                {row.number ?? <span className="text-txt-4">مسودة</span>}
              </td>
              <td className="px-4 py-3 text-txt-2">
                {row.customer.companyName ?? row.customer.contactName}
              </td>
              <td className="tnum px-4 py-3 text-txt-3">
                {row.issueDate ? row.issueDate.toLocaleDateString('ar-EG') : '—'}
              </td>
              <td className="tnum px-4 py-3">
                {row.dueDate ? (
                  <span className={late > 0 ? 'text-bad' : 'text-txt-3'}>
                    {row.dueDate.toLocaleDateString('ar-EG')}
                    {late > 0 && <span className="ms-2 text-[0.7rem]">متأخرة {late} يوم</span>}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="tnum px-4 py-3 text-txt-2">{formatMoney(row.total)}</td>
              <td className="tnum px-4 py-3 text-txt-3">{formatMoney(row.paidAmount)}</td>
              <td className={`tnum px-4 py-3 font-medium ${dec(left).gt(0) ? 'text-brand' : 'text-ok'}`}>
                {formatMoney(left)}
              </td>
              <td className="px-4 py-3">
                <Badge tone={TONE[row.status] ?? 'muted'}>
                  {(INVOICE_STATUS_AR as Record<string, string>)[row.status] ?? row.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-end">
                <Link href={`/invoices/${row.id}`} className="text-xs text-brand hover:underline">
                  عرض
                </Link>
              </td>
            </tr>
          );
        })}
      </Table>

      <Pager basePath="/invoices" query={query} count={count} />

      {canWrite && (
        <p className="mt-6 text-[0.7rem] text-txt-4">
          الفواتير تُنشأ من أوامر البيع المؤكَّدة — افتح أمر البيع واضغط «إنشاء فاتورة».
        </p>
      )}
    </AppShell>
  );
}
