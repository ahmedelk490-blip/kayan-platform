import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { can } from '@erp/domain';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { deleteReturn } from './actions';
import { categoriesOf } from './category';

export const metadata: Metadata = { title: 'المرتجعات' };

/** قائمة مرتجعات المبيعات — رقم، تاريخ، فاتورة، عميل، تصنيف، قطع، قيمة، وعرض التفاصيل. */
export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('returns.view');
  const canWrite = can(user.role, 'returns.write');
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? '';

  const returns = await prisma.salesReturn.findMany({
    where: {
      tenantId: user.tenantId,
      isDeleted: false,
      ...(q
        ? { OR: [{ customerName: { contains: q } }, { number: { contains: q } }, { invoiceNumber: { contains: q } }] }
        : {}),
    },
    orderBy: { returnDate: 'desc' },
    take: 200,
    include: { lines: { select: { description: true, quantity: true } } },
  });

  const total = returns.reduce((s, r) => s.plus(dec(r.totalAmount)), dec(0));
  // عدد القطع لكل مرتجع = مجموع كميات سطوره؛ والإجمالي لكرت الملخّص.
  const piecesOf = (r: (typeof returns)[number]) =>
    r.lines.reduce((s, l) => s + Number(l.quantity), 0);
  const totalPieces = returns.reduce((s, r) => s + piecesOf(r), 0);

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
          <p className="text-[0.7rem] text-txt-3">عدد القطع المرجعة</p>
          <p className="tnum mt-1 text-xl font-bold text-brand">{totalPieces.toLocaleString('en-US')}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">إجمالي قيمة المرتجعات</p>
          <p className="tnum mt-1 text-xl font-bold text-brand">{formatMoney(total)}</p>
        </div>
      </div>

      <form className="mb-4" action="/returns">
        <input
          name="q"
          defaultValue={q}
          placeholder="ابحث باسم العميل أو رقم المرتجع أو الفاتورة…"
          className="erp-input w-full max-w-md py-2.5"
        />
      </form>

      <Table
        headers={['الرقم', 'التاريخ', 'الفاتورة', 'العميل', 'التصنيف', 'القطع', 'القيمة', '']}
        empty={returns.length === 0}
      >
        {returns.map((r) => (
          <tr key={r.id} className="hover:bg-card-2">
            <td className="tnum px-4 py-3 text-txt">
              <Link href={`/returns/${r.id}`} className="hover:text-brand hover:underline">{r.number}</Link>
            </td>
            <td className="tnum px-4 py-3 text-txt-3">{r.returnDate.toLocaleDateString('ar-EG')}</td>
            <td className="tnum px-4 py-3 text-txt-2">
              <Link href={`/invoices/${r.invoiceId}`} className="text-brand hover:underline">{r.invoiceNumber ?? '—'}</Link>
            </td>
            <td className="px-4 py-3 text-txt-2">{r.customerName ?? '—'}</td>
            <td className="px-4 py-3">
              <span className="inline-block rounded-full border border-line-2 bg-card-2 px-2.5 py-1 text-[0.7rem] text-txt-2">
                {categoriesOf(r.lines.map((l) => l.description)).join(' + ')}
              </span>
            </td>
            <td className="tnum px-4 py-3 text-txt-2">{piecesOf(r).toLocaleString('en-US')}</td>
            <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(dec(r.totalAmount))}</td>
            <td className="px-4 py-3 text-end">
              <div className="flex items-center justify-end gap-3">
                <Link href={`/returns/${r.id}`} className="text-[0.7rem] font-medium text-brand hover:underline">
                  عرض
                </Link>
                {canWrite && (
                  <form action={deleteReturn.bind(null, r.id)}>
                    <button type="submit" className="text-[0.7rem] text-bad hover:underline">حذف</button>
                  </form>
                )}
              </div>
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
