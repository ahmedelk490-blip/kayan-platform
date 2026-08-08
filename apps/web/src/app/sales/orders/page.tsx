import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { can, ORDER_STATUSES, ORDER_STATUS_AR, formatMoney } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { StatusBadge } from '../StatusBadge';

export const metadata: Metadata = { title: 'أوامر البيع' };

const SORTS = [
  { value: 'createdAt', label: 'الأحدث' },
  { value: 'number', label: 'الرقم' },
  { value: 'total', label: 'الإجمالي' },
];

export default async function OrdersPage({
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

  const where: Prisma.SalesOrderWhereInput = {
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
    prisma.salesOrder.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        customer: { select: { contactName: true, companyName: true } },
        _count: { select: { lines: true, movements: true } },
      },
    }),
    prisma.salesOrder.count({ where }),
  ]);

  const canWrite = can(user.role, 'sales.write');

  return (
    <AppShell user={user} title="أوامر البيع">
      <ModuleHeader
        title="أوامر البيع"
        count={count}
        action={
          canWrite ? (
            <Link href="/sales/orders/new" className="erp-btn">
              أمر بيع جديد
            </Link>
          ) : null
        }
      />

      <Toolbar placeholder="ابحث بالرقم أو العميل…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/sales/orders"
          className={
            statusFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/sales/orders?status=${s}`}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {ORDER_STATUS_AR[s]}
          </Link>
        ))}
      </div>

      <Table
        headers={['الرقم', 'العميل', 'التاريخ', 'البنود', 'حركات الحجز', 'الإجمالي', 'الحالة', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
              {row.number}
            </td>
            <td className="px-4 py-3 text-txt-2">
              {row.customer.companyName ?? row.customer.contactName}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">
              {row.orderDate.toLocaleDateString('ar-EG')}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.lines}</td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.movements}</td>
            <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(row.total)}</td>
            <td className="px-4 py-3">
              <StatusBadge status={row.status} kind="order" />
            </td>
            <td className="px-4 py-3 text-end">
              <Link href={`/sales/orders/${row.id}`} className="text-xs text-brand hover:underline">
                عرض
              </Link>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/sales/orders" query={query} count={count} />
    </AppShell>
  );
}
