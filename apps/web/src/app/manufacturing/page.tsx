import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  can,
  formatQty,
  PRODUCTION_STATUSES,
  PRODUCTION_STATUS_AR,
  PRIORITY_WEIGHT,
  type Priority,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { ProductionBadge, PriorityBadge } from './StatusBadge';

export const metadata: Metadata = { title: 'أوامر الإنتاج' };

const SORTS = [
  { value: 'createdAt', label: 'الأحدث' },
  { value: 'number', label: 'الرقم' },
  { value: 'priority', label: 'الأولوية' },
  { value: 'plannedEndDate', label: 'موعد التسليم المخطط' },
];

export default async function ManufacturingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('manufacturing.view');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'createdAt',
    allowedSorts: SORTS.map((s) => s.value),
  });
  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;

  const where: Prisma.ProductionOrderWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q } },
            { product: { nameAr: { contains: query.q } } },
            { variant: { sku: { contains: query.q } } },
            { salesOrder: { number: { contains: query.q } } },
            { customer: { contactName: { contains: query.q } } },
            { customer: { companyName: { contains: query.q } } },
          ],
        }
      : {}),
  };

  // `priority` is stored as a string, so a database sort would order it
  // alphabetically — HIGH, LOW, NORMAL, URGENT — which is meaningless. When
  // that sort is chosen the page falls back to ordering in memory by weight.
  const sortingByPriority = query.sort === 'priority';

  const [rows, count] = await Promise.all([
    prisma.productionOrder.findMany({
      where,
      orderBy: sortingByPriority ? { createdAt: 'desc' } : { [query.sort]: query.dir },
      ...(sortingByPriority ? {} : skipTake(query)),
      include: {
        product: { select: { nameAr: true } },
        variant: { select: { sku: true } },
        customer: { select: { contactName: true, companyName: true } },
        salesOrder: { select: { id: true, number: true } },
        _count: { select: { workOrders: true } },
      },
    }),
    prisma.productionOrder.count({ where }),
  ]);

  const page = sortingByPriority
    ? [...rows]
        .sort((a, b) => {
          const d =
            PRIORITY_WEIGHT[a.priority as Priority] - PRIORITY_WEIGHT[b.priority as Priority];
          return query.dir === 'desc' ? -d : d;
        })
        .slice(skipTake(query).skip, skipTake(query).skip + query.perPage)
    : rows;

  const canWrite = can(user.role, 'manufacturing.write');

  return (
    <AppShell user={user} title="أوامر الإنتاج">
      <ModuleHeader
        title="أوامر الإنتاج"
        count={count}
        action={
          canWrite ? (
            <Link href="/manufacturing/new" className="erp-btn">
              أمر إنتاج جديد
            </Link>
          ) : null
        }
      />

      <Toolbar placeholder="ابحث بالرقم أو المنتج أو أمر البيع…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/manufacturing"
          className={
            statusFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {PRODUCTION_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/manufacturing?status=${s}`}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {PRODUCTION_STATUS_AR[s]}
          </Link>
        ))}
      </div>

      <Table
        headers={[
          'الرقم',
          'المنتج',
          'الكمية',
          'الأولوية',
          'أمر البيع',
          'العميل',
          'التسليم المخطط',
          'الخطوات',
          'الحالة',
          '',
        ]}
        empty={page.length === 0}
      >
        {page.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
              {row.number}
            </td>
            <td className="px-4 py-3 text-txt-2">
              {row.product.nameAr}
              <span dir="ltr" className="ms-2 text-[0.7rem] text-txt-4">
                {row.variant.sku}
              </span>
            </td>
            <td className="tnum px-4 py-3 text-txt-2">{formatQty(row.quantity)}</td>
            <td className="px-4 py-3">
              <PriorityBadge priority={row.priority} />
            </td>
            <td className="tnum px-4 py-3 text-txt-3">
              {row.salesOrder ? (
                <Link
                  href={`/sales/orders/${row.salesOrder.id}`}
                  dir="ltr"
                  className="text-brand hover:underline"
                >
                  {row.salesOrder.number}
                </Link>
              ) : (
                <span className="text-txt-4">للمخزون</span>
              )}
            </td>
            <td className="px-4 py-3 text-txt-3">
              {row.customer
                ? (row.customer.companyName ?? row.customer.contactName)
                : '—'}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">
              {row.plannedEndDate ? row.plannedEndDate.toLocaleDateString('ar-EG') : '—'}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.workOrders}</td>
            <td className="px-4 py-3">
              <ProductionBadge status={row.status} />
            </td>
            <td className="px-4 py-3 text-end">
              <Link href={`/manufacturing/${row.id}`} className="text-xs text-brand hover:underline">
                عرض
              </Link>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/manufacturing" query={query} count={count} />
    </AppShell>
  );
}
