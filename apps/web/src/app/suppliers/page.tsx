import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';

export const metadata: Metadata = { title: 'الموردون' };

const SORTS = [
  { value: 'createdAt', label: 'الأحدث' },
  { value: 'name', label: 'الاسم' },
  { value: 'code', label: 'الكود' },
];

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('suppliers.read');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'createdAt',
    allowedSorts: SORTS.map((s) => s.value),
  });

  const where: Prisma.SupplierWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q } },
            { contactName: { contains: query.q } },
            { phone: { contains: query.q } },
            { code: { contains: query.q } },
          ],
        }
      : {}),
  };

  const [rows, count] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: { _count: { select: { products: true } } },
    }),
    prisma.supplier.count({ where }),
  ]);

  const canWrite = can(user.role, 'suppliers.write');

  return (
    <AppShell user={user} title="الموردون">
      <ModuleHeader
        title="الموردون"
        count={count}
        action={
          canWrite ? (
            <Link href="/suppliers/new" className="erp-btn">
              مورّد جديد
            </Link>
          ) : null
        }
      />

      <Toolbar placeholder="ابحث بالاسم أو الهاتف…" sorts={SORTS} />

      <Table headers={['الكود', 'المورّد', 'المسؤول', 'الهاتف', 'المنتجات', 'التقييم', '']} empty={rows.length === 0}>
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-3">
              {row.code}
            </td>
            <td className="px-4 py-3 font-medium text-txt">{row.name}</td>
            <td className="px-4 py-3 text-txt-2">{row.contactName ?? '—'}</td>
            <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-2">
              {row.phone}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.products}</td>
            <td className="px-4 py-3 text-brand">{row.rating ? '★'.repeat(row.rating) : '—'}</td>
            <td className="px-4 py-3 text-end">
              <Link href={`/suppliers/${row.id}`} className="text-xs text-brand hover:underline">
                عرض
              </Link>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/suppliers" query={query} count={count} />
    </AppShell>
  );
}
