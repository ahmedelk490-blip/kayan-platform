import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { can } from '@erp/domain';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { deleteReturn } from './actions';

export const metadata: Metadata = { title: 'المرتجعات' };

/** قائمة مرتجعات المبيعات — رقم، تاريخ، فاتورة، عميل، قيمة، عدد أصناف. */
export default async function ReturnsPage() {
  const user = await requirePermission('returns.view');
  const canWrite = can(user.role, 'returns.write');

  const returns = await prisma.salesReturn.findMany({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { returnDate: 'desc' },
    take: 200,
    include: { _count: { select: { lines: true } } },
  });

  const total = returns.reduce((s, r) => s.plus(dec(r.totalAmount)), dec(0));

  return (
    <AppShell user={user} title="المرتجعات">
      <ModuleHeader
        title="المرتجعات"
        count={returns.length}
        action={canWrite ? <Link href="/returns/new" className="erp-btn">+ مرتجع جديد</Link> : null}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">عدد المرتجعات</p>
          <p className="tnum mt-1 text-xl font-bold text-brand">{returns.length}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">إجمالي قيمة المرتجعات</p>
          <p className="tnum mt-1 text-xl font-bold text-brand">{formatMoney(total)}</p>
        </div>
      </div>

      <Table
        headers={['الرقم', 'التاريخ', 'الفاتورة', 'العميل', 'الأصناف', 'القيمة', '']}
        empty={returns.length === 0}
      >
        {returns.map((r) => (
          <tr key={r.id} className="hover:bg-card-2">
            <td className="tnum px-4 py-3 text-txt">{r.number}</td>
            <td className="tnum px-4 py-3 text-txt-3">{r.returnDate.toLocaleDateString('ar-EG')}</td>
            <td className="tnum px-4 py-3 text-txt-2">
              <Link href={`/invoices/${r.invoiceId}`} className="text-brand hover:underline">{r.invoiceNumber ?? '—'}</Link>
            </td>
            <td className="px-4 py-3 text-txt-2">{r.customerName ?? '—'}</td>
            <td className="tnum px-4 py-3 text-txt-3">{r._count.lines}</td>
            <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(dec(r.totalAmount))}</td>
            <td className="px-4 py-3 text-end">
              {canWrite && (
                <form action={deleteReturn.bind(null, r.id)}>
                  <button type="submit" className="text-[0.7rem] text-bad hover:underline">حذف</button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
        المرتجع يعيد البضاعة للمخزون ويُخصم من مبيعات المندوب (منشئ الفاتورة) في تحليل الموظفين.
      </p>
    </AppShell>
  );
}
