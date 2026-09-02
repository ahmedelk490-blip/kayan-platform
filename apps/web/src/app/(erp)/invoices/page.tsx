import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  can,
  userCan,
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
  QUOTATION_STATUS_AR,
  ORDER_STATUS_AR,
  ORDER_SOURCES,
  ORDER_SOURCE_AR,
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
    // الأحدث أولاً افتراضياً (تنازلي) بدل الأقدم — بطلب المالك.
    defaultDir: 'desc',
  });
  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;
  const sourceFilter = Array.isArray(params.source) ? params.source[0] : params.source;

  // من لا يملك «عرض فواتير كل الموظفين» يرى فواتيره هو فقط. المدير يرى الكل.
  const seeAll = userCan(user.role, user.overrides, 'invoices.viewAll');
  const ownerScope: Prisma.InvoiceWhereInput = seeAll ? {} : { createdById: user.id };

  const searchScope: Prisma.InvoiceWhereInput = query.q
    ? {
        OR: [
          { number: { contains: query.q } },
          { customer: { contactName: { contains: query.q } } },
          { customer: { companyName: { contains: query.q } } },
        ],
      }
    : {};

  const where: Prisma.InvoiceWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...ownerScope,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...searchScope,
  };

  // عدّادات الشرائح: كل مصدر بعدد فواتيره (ضمن الحالة والبحث الحاليين)، وكل
  // حالة بعدد فواتيرها (ضمن المصدر والبحث) — لا عدّ يدوي حين تصير بالآلاف.
  const [bySource, byStatus] = await Promise.all([
    prisma.invoice.groupBy({
      by: ['source'],
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        ...ownerScope,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...searchScope,
      },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: ['status'],
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        ...ownerScope,
        ...(sourceFilter ? { source: sourceFilter } : {}),
        ...searchScope,
      },
      _count: { _all: true },
    }),
  ]);
  const sourceCount = new Map(bySource.map((g) => [g.source ?? '', g._count._all]));
  const sourceTotal = bySource.reduce((s, g) => s + g._count._all, 0);
  const statusCount = new Map(byStatus.map((g) => [g.status, g._count._all]));
  const statusTotal = byStatus.reduce((s, g) => s + g._count._all, 0);

  const [rows, count, receivable] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        customer: { select: { contactName: true, companyName: true } },
        _count: { select: { lines: true, payments: true } },
        // كميات السطور — لعمود «القطع»: كم قطعة في كل فاتورة، بطلب المالك.
        lines: { select: { quantity: true } },
      },
    }),
    prisma.invoice.count({ where }),
    // Only issued and part-paid invoices are money anyone owes. A draft is
    // not a claim, and a void one never was.
    prisma.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, ...ownerScope, status: { in: RECEIVABLE_STATUSES } },
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

  // الأقسام المبسّطة أسفل الفواتير — عروض الأسعار وأوامر البيع وطلبات الموقع
  // لم تعد تبويبات مستقلة، بل لمحة سريعة هنا مع رابط لكل شاشة كاملة.
  const seeDocs = can(user.role, 'sales.documents');
  const seeRequests = can(user.role, 'customers.read');
  const [recentQuotations, recentOrders, recentRequests] = await Promise.all([
    seeDocs
      ? prisma.quotation.findMany({
          where: { tenantId: user.tenantId, isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true, number: true, total: true, status: true,
            customer: { select: { contactName: true, companyName: true } },
          },
        })
      : [],
    seeDocs
      ? prisma.salesOrder.findMany({
          where: { tenantId: user.tenantId, isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true, number: true, total: true, status: true,
            customer: { select: { contactName: true, companyName: true } },
          },
        })
      : [],
    seeRequests
      ? prisma.customerActivity.findMany({
          where: { type: 'INQUIRY', customer: { tenantId: user.tenantId, isDeleted: false } },
          orderBy: { occurredAt: 'desc' },
          take: 5,
          select: {
            id: true, title: true, occurredAt: true,
            customer: { select: { contactName: true, companyName: true } },
          },
        })
      : [],
  ]);

  return (
    <AppShell user={user} title="الفواتير">
      <ModuleHeader
        title={seeAll ? 'الفواتير' : 'فواتيري'}
        count={count}
        action={
          canWrite ? (
            <Link href="/invoices/new" className="erp-btn">
              فاتورة مبيعات جديدة
            </Link>
          ) : null
        }
      />
      {!seeAll && (
        <p className="mb-4 text-xs text-txt-3">تعرض فواتيرك التي أنشأتها فقط. المدير يرى فواتير كل الموظفين.</p>
      )}

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

      <Toolbar placeholder="ابحث بالرقم أو العميل…" sorts={SORTS} defaultDir="desc" />

      {/* كل شريحة بعددها — لا عدّ يدوي حين تصير الفواتير بالآلاف. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/invoices" className={statusFilter ? 'erp-pill' : 'erp-pill-active'}>
          الكل <span className="tnum ms-1 opacity-80">({statusTotal})</span>
        </Link>
        {INVOICE_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/invoices?status=${s}`}
            className={statusFilter === s ? 'erp-pill-active' : 'erp-pill'}
          >
            {INVOICE_STATUS_AR[s]}
            <span className="tnum ms-1 opacity-80">({statusCount.get(s) ?? 0})</span>
          </Link>
        ))}
      </div>

      {/* فلتر مصدر الطلب — لمعرفة أكثر قناة تجلب الطلبات، وبعدد كل مصدر. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={statusFilter ? `/invoices?status=${statusFilter}` : '/invoices'}
          className={sourceFilter ? 'erp-pill' : 'erp-pill-active'}
        >
          كل المصادر <span className="tnum ms-1 opacity-80">({sourceTotal})</span>
        </Link>
        {ORDER_SOURCES.map((s) => (
          <Link
            key={s}
            href={`/invoices?source=${s}${statusFilter ? `&status=${statusFilter}` : ''}`}
            className={sourceFilter === s ? 'erp-pill-active' : 'erp-pill'}
          >
            {ORDER_SOURCE_AR[s]}
            <span className="tnum ms-1 opacity-80">({sourceCount.get(s) ?? 0})</span>
          </Link>
        ))}
      </div>

      <Table
        headers={['الرقم', 'العميل', 'المصدر', 'القطع', 'الإصدار', 'الاستحقاق', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => {
          const left = balance(row.total, row.paidAmount);
          const late = daysOverdue(row.dueDate, left);
          const pieces = row.lines.reduce((s, l) => s + Number(l.quantity), 0);
          return (
            <tr key={row.id} className="hover:bg-card-2">
              <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
                {row.number ?? <span className="text-txt-4">مسودة</span>}
              </td>
              <td className="px-4 py-3 text-txt-2">
                {row.customer.companyName ?? row.customer.contactName}
              </td>
              <td className="px-4 py-3 text-[0.7rem] text-txt-3">
                {row.source ? (ORDER_SOURCE_AR as Record<string, string>)[row.source] ?? row.source : '—'}
              </td>
              <td className="tnum px-4 py-3 font-medium text-txt-2">{pieces}</td>
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

      {/* أقسام مبسّطة أسفل الفواتير — لمحة سريعة وروابط للشاشات الكاملة. */}
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {seeDocs && (
          <SubSection
            title="عروض الأسعار"
            allHref="/sales/quotations"
            newHref="/sales/quotations/new"
            emptyNote="لا عروض أسعار بعد."
            rows={recentQuotations.map((q) => ({
              id: q.id,
              href: `/sales/quotations/${q.id}`,
              primary: q.number,
              secondary: q.customer.companyName ?? q.customer.contactName,
              badge: QUOTATION_STATUS_AR[q.status as keyof typeof QUOTATION_STATUS_AR] ?? q.status,
              amount: formatMoney(q.total),
            }))}
          />
        )}
        {seeDocs && (
          <SubSection
            title="أوامر البيع"
            allHref="/sales/orders"
            newHref="/sales/orders/new"
            emptyNote="لا أوامر بيع بعد."
            rows={recentOrders.map((o) => ({
              id: o.id,
              href: `/sales/orders/${o.id}`,
              primary: o.number,
              secondary: o.customer.companyName ?? o.customer.contactName,
              badge: ORDER_STATUS_AR[o.status as keyof typeof ORDER_STATUS_AR] ?? o.status,
              amount: formatMoney(o.total),
            }))}
          />
        )}
        {seeRequests && (
          <SubSection
            title="طلبات الموقع"
            allHref="/requests"
            emptyNote="لا طلبات من الموقع بعد."
            rows={recentRequests.map((r) => ({
              id: r.id,
              href: '/requests',
              primary: r.customer.companyName ?? r.customer.contactName,
              secondary: r.title,
            }))}
          />
        )}
      </div>
    </AppShell>
  );
}

/** قسم مبسّط أسفل الفواتير: عنوان + روابط + آخر خمس مدخلات. */
function SubSection({
  title,
  allHref,
  newHref,
  emptyNote,
  rows,
}: {
  title: string;
  allHref: string;
  newHref?: string;
  emptyNote: string;
  rows: { id: string; href: string; primary: string; secondary?: string; badge?: string; amount?: string }[];
}) {
  return (
    <section className="erp-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand">{title}</h3>
        <div className="flex items-center gap-3 text-xs">
          {newHref && (
            <Link href={newHref} className="text-brand hover:underline">
              جديد
            </Link>
          )}
          <Link href={allHref} className="text-txt-3 hover:text-brand hover:underline">
            عرض الكل
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-txt-4">{emptyNote}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex items-center justify-between gap-3 py-2.5 text-xs transition-colors hover:text-brand">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-txt" dir="auto">{r.primary}</span>
                  {r.secondary && <span className="block truncate text-txt-3">{r.secondary}</span>}
                </span>
                {r.badge && <span className="shrink-0 rounded-full bg-card-2 px-2 py-0.5 text-[0.65rem] text-txt-3">{r.badge}</span>}
                {r.amount && <span className="tnum shrink-0 font-medium text-txt-2">{r.amount}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
