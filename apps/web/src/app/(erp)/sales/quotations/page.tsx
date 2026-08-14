import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { can, QUOTATION_STATUSES, QUOTATION_STATUS_AR, formatMoney } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { StatusBadge } from '../StatusBadge';

export const metadata: Metadata = { title: 'عروض الأسعار' };

const SORTS = [
  { value: 'createdAt', label: 'الأحدث' },
  { value: 'number', label: 'الرقم' },
  { value: 'total', label: 'الإجمالي' },
];

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('sales.documents');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'createdAt',
    allowedSorts: SORTS.map((s) => s.value),
  });
  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;

  const where: Prisma.QuotationWhereInput = {
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

  const [rows, count] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        customer: { select: { contactName: true, companyName: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.quotation.count({ where }),
  ]);

  const canWrite = can(user.role, 'sales.write');

  return (
    <AppShell user={user} title="عروض الأسعار">
      <ModuleHeader
        title="عروض الأسعار"
        count={count}
        action={
          canWrite ? (
            <Link href="/sales/quotations/new" className="erp-btn">
              عرض سعر جديد
            </Link>
          ) : null
        }
      />

      <Toolbar placeholder="ابحث بالرقم أو العميل…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/sales/quotations"
          className={
            statusFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {QUOTATION_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/sales/quotations?status=${s}`}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {QUOTATION_STATUS_AR[s]}
          </Link>
        ))}
      </div>

      <Table headers={['الرقم', 'العميل', 'التاريخ', 'البنود', 'الإجمالي', 'الحالة', '']} empty={rows.length === 0}>
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
              {row.number}
            </td>
            <td className="px-4 py-3 text-txt-2">
              {row.customer.companyName ?? row.customer.contactName}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">
              {row.issueDate.toLocaleDateString('ar-EG')}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.lines}</td>
            <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(row.total)}</td>
            <td className="px-4 py-3">
              <StatusBadge status={row.status} kind="quotation" />
            </td>
            <td className="px-4 py-3 text-end">
              <Link href={`/sales/quotations/${row.id}`} className="text-xs text-brand hover:underline">
                عرض
              </Link>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/sales/quotations" query={query} count={count} />
    </AppShell>
  );
}
