import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { can } from '@erp/domain';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { NewCustomerModal, EditCustomerModal } from './CustomerModal';

export const metadata: Metadata = { title: 'العملاء' };

const SORTS = [
  { value: 'createdAt', label: 'الأحدث' },
  { value: 'contactName', label: 'اسم المسؤول' },
  { value: 'companyName', label: 'الشركة' },
  { value: 'code', label: 'الكود' },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('customers.read');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'createdAt',
    allowedSorts: SORTS.map((s) => s.value),
  });

  const where: Prisma.CustomerWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(query.q
      ? {
          OR: [
            { contactName: { contains: query.q } },
            { companyName: { contains: query.q } },
            { phone: { contains: query.q } },
            { code: { contains: query.q } },
            { email: { contains: query.q } },
          ],
        }
      : {}),
  };

  const [rows, count] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: { _count: { select: { activities: true } } },
    }),
    prisma.customer.count({ where }),
  ]);

  const canWrite = can(user.role, 'customers.write');

  return (
    <AppShell user={user} title="العملاء">
      <ModuleHeader
        title="العملاء"
        count={count}
        action={canWrite ? <NewCustomerModal /> : null}
      />

      <Toolbar placeholder="ابحث بالاسم أو الهاتف أو الكود…" sorts={SORTS} />

      <Table
        headers={['الكود', 'اسم المسؤول', 'الشركة', 'الهاتف', 'النشاطات', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-3">
              {row.code}
            </td>
            <td className="px-4 py-3 font-medium text-txt">{row.contactName}</td>
            <td className="px-4 py-3 text-txt-2">{row.companyName ?? '—'}</td>
            <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-2">
              {row.phone}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.activities}</td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-3">
                {canWrite && (
                  <EditCustomerModal
                    id={row.id}
                    code={row.code}
                    values={{
                      contactName: row.contactName,
                      companyName: row.companyName,
                      phone: row.phone,
                      whatsapp: row.whatsapp,
                      email: row.email,
                      address: row.address,
                      taxNumber: row.taxNumber,
                      notes: row.notes,
                    }}
                  />
                )}
                <Link href={`/customers/${row.id}`} className="text-xs text-brand hover:underline">
                  عرض
                </Link>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/customers" query={query} count={count} />
    </AppShell>
  );
}
