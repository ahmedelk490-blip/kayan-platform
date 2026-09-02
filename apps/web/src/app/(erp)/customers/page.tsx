import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { waLink } from '@/lib/wa';
import { can, dec, formatMoney, CUSTOMER_SOURCE_AR } from '@erp/domain';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { NewCustomerModal, EditCustomerModal } from './CustomerModal';

export const metadata: Metadata = { title: 'العملاء' };

const SORTS = [
  { value: 'createdAt', label: 'الأحدث' },
  { value: 'debt', label: 'الأعلى ديناً' },
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

  // دين كل عميل المفتوح — تجميعة واحدة، فتصير قائمة العملاء قائمةَ تحصيل.
  const openInvoices = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: {
      tenantId: user.tenantId,
      isDeleted: false,
      status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
    },
    _sum: { total: true, paidAmount: true },
    _count: { customerId: true },
  });
  const debts = new Map<string, { amount: number; count: number }>();
  for (const g of openInvoices) {
    const amount = dec(g._sum.total ?? 0).minus(dec(g._sum.paidAmount ?? 0)).toNumber();
    if (amount > 0) debts.set(g.customerId, { amount, count: g._count.customerId });
  }

  // فرز «الأعلى ديناً»: قائمة المدينين مرتّبة تنازلياً — قائمة التحصيل نفسها.
  const byDebt = query.sort === 'debt';
  let rows;
  let count;
  if (byDebt) {
    const ids = [...debts.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([id]) => id);
    count = ids.length;
    const pageIds = ids.slice((query.page - 1) * query.perPage, query.page * query.perPage);
    const fetched = await prisma.customer.findMany({
      where: { ...where, id: { in: pageIds } },
      include: { _count: { select: { activities: true } } },
    });
    const order = new Map(pageIds.map((id, i) => [id, i]));
    rows = fetched.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } else {
    [rows, count] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { [query.sort]: query.dir },
        ...skipTake(query),
        include: { _count: { select: { activities: true } } },
      }),
      prisma.customer.count({ where }),
    ]);
  }

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
        headers={['الكود', 'اسم المسؤول', 'الشركة', 'الهاتف', 'عليه', 'المصدر', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => {
          const debt = debts.get(row.id);
          const wa = waLink(
            row.whatsapp ?? row.phone,
            debt
              ? `السلام عليكم ${row.contactName}، تحية من كيان للزي الموحد. نودّ تذكيركم بالمتبقي لدينا: ${formatMoney(dec(debt.amount))} د.ع من ${debt.count} ${debt.count === 1 ? 'فاتورة' : 'فواتير'}. شاكرين تعاونكم 🌹`
              : `السلام عليكم ${row.contactName}، تحية من كيان للزي الموحد 🌹`,
          );
          return (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-3">
              {row.code}
            </td>
            <td className="px-4 py-3 font-medium text-txt">{row.contactName}</td>
            <td className="px-4 py-3 text-txt-2">{row.companyName ?? '—'}</td>
            <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-2">
              {row.phone}
            </td>
            <td className="tnum px-4 py-3">
              {debt ? (
                <span className="font-semibold text-warn" title={`${debt.count} فاتورة مفتوحة`}>
                  {formatMoney(dec(debt.amount))}
                </span>
              ) : (
                <span className="text-ok">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-[0.7rem] text-txt-3">
              {row.source ? (CUSTOMER_SOURCE_AR as Record<string, string>)[row.source] ?? row.source : '—'}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-3">
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="erp-btn-wa erp-btn-sm"
                    title={debt ? 'تذكير بالمتبقي عبر واتساب' : 'مراسلة واتساب'}
                  >
                    واتساب
                  </a>
                )}
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
          );
        })}
      </Table>

      <Pager basePath="/customers" query={query} count={count} />
    </AppShell>
  );
}
