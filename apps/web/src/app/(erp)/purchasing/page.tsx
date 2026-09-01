import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { can, formatMoney, PURCHASE_STATUSES, PURCHASE_STATUS_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager, Badge } from '@/components/crud/Shell';
import { StatCard } from '@/components/dashboard/StatCard';
import { IconBell, IconCategory, IconProduct } from '@/components/dashboard/Icons';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';

export const metadata: Metadata = { title: 'أوامر الشراء' };

const SORTS = [
  { value: 'orderDate', label: 'التاريخ' },
  { value: 'number', label: 'الرقم' },
  { value: 'total', label: 'الإجمالي' },
];

const TONE: Record<string, 'ok' | 'bad' | 'muted'> = {
  RECEIVED: 'ok',
  CONFIRMED: 'ok',
  PARTIALLY_RECEIVED: 'muted',
  DRAFT: 'muted',
  CANCELLED: 'bad',
};

export default async function PurchasingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('purchasing.view');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'orderDate',
    allowedSorts: SORTS.map((s) => s.value),
  });
  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;

  const where: Prisma.PurchaseOrderWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q } },
            { supplier: { name: { contains: query.q } } },
          ],
        }
      : {}),
  };

  const [rows, count, outstanding, totalCount, receivedCount] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        supplier: { select: { name: true } },
        _count: { select: { lines: true, receipts: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.aggregate({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.purchaseOrder.count({ where: { tenantId: user.tenantId, isDeleted: false } }),
    prisma.purchaseOrder.count({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'RECEIVED' },
    }),
  ]);

  const canWrite = can(user.role, 'purchasing.write');

  return (
    <AppShell user={user} title="أوامر الشراء">
      <ModuleHeader
        title="أوامر الشراء"
        count={count}
        action={
          canWrite ? (
            <Link href="/purchasing/new" className="erp-btn">
              أمر شراء جديد
            </Link>
          ) : null
        }
      />

      {/* أرقام حيّة بأيقونات — بأسلوب لوحة المدير نفسه. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          index={0}
          label="قيمة الأوامر المفتوحة"
          value={formatMoney(outstanding._sum.total ?? 0)}
          hint={`${outstanding._count._all} أمر مؤكَّد لم يُستلم بالكامل`}
          icon={<IconBell />}
          tone={outstanding._count._all > 0 ? 'warning' : 'success'}
        />
        <StatCard
          index={1}
          label="أوامر الشراء (الكل)"
          value={totalCount}
          unit="أمر"
          icon={<IconCategory />}
          tone="primary"
        />
        <StatCard
          index={2}
          label="مستلمة بالكامل"
          value={receivedCount}
          unit="أمر"
          icon={<IconProduct />}
          tone="success"
        />
      </div>

      <Toolbar placeholder="ابحث بالرقم أو المورّد…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/purchasing"
          className={
            statusFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {PURCHASE_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/purchasing?status=${s}`}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {PURCHASE_STATUS_AR[s]}
          </Link>
        ))}
      </div>

      <Table
        headers={['الرقم', 'المورّد', 'التاريخ', 'البنود', 'الاستلامات', 'الإجمالي', 'الحالة', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
              {row.number}
            </td>
            <td className="px-4 py-3 text-txt-2">{row.supplier.name}</td>
            <td className="tnum px-4 py-3 text-txt-3">
              {row.orderDate.toLocaleDateString('ar-EG')}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.lines}</td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.receipts}</td>
            <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(row.total)}</td>
            <td className="px-4 py-3">
              <Badge tone={TONE[row.status] ?? 'muted'}>
                {(PURCHASE_STATUS_AR as Record<string, string>)[row.status] ?? row.status}
              </Badge>
            </td>
            <td className="px-4 py-3 text-end">
              <Link href={`/purchasing/${row.id}`} className="text-xs text-brand hover:underline">
                عرض
              </Link>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/purchasing" query={query} count={count} />
    </AppShell>
  );
}
