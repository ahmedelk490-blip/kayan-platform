import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { can } from '@erp/domain';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Pager } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';
import { ConfirmButton } from '@/components/crud/ConfirmButton';
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
  const query = parseListQuery(params, {
    defaultSort: 'returnDate',
    allowedSorts: ['returnDate'],
    perPage: 50,
    defaultDir: 'desc',
  });
  const q = query.q;

  const listWhere = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(q
      ? { OR: [{ customerName: { contains: q } }, { number: { contains: q } }, { invoiceNumber: { contains: q } }] }
      : {}),
  };

  // القائمة مرقّمة صفحات، والكروت من تجميعات كلية في قاعدة البيانات — لا من
  // شريحة معروضة تُقدَّم كإجمالي وهي ناقصة.
  const [returns, listCount, agg, piecesAgg] = await Promise.all([
    prisma.salesReturn.findMany({
      where: listWhere,
      orderBy: { returnDate: 'desc' },
      ...skipTake(query),
      include: { lines: { select: { description: true, quantity: true } } },
    }),
    prisma.salesReturn.count({ where: listWhere }),
    prisma.salesReturn.aggregate({
      where: { tenantId: user.tenantId, isDeleted: false },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.salesReturnLine.aggregate({
      where: { salesReturn: { tenantId: user.tenantId, isDeleted: false } },
      _sum: { quantity: true },
    }),
  ]);

  const total = dec(agg._sum.totalAmount ?? 0);
  const totalPieces = Number(piecesAgg._sum.quantity ?? 0);
  // عدد القطع لكل مرتجع معروض = مجموع كميات سطوره.
  const piecesOf = (r: (typeof returns)[number]) =>
    r.lines.reduce((s, l) => s + Number(l.quantity), 0);

  return (
    <AppShell user={user} title="المرتجعات">
      <ModuleHeader
        title="المرتجعات"
        count={listCount}
        action={canWrite ? <Link href="/returns/new" className="erp-btn">+ مرتجع جديد</Link> : null}
      />

      {/* الكروت إجماليات كلية من قاعدة البيانات — لا تتأثر بالبحث أو الصفحة. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">عدد المرتجعات (الكل)</p>
          <p className="tnum mt-1 text-xl font-bold text-brand">{agg._count}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">عدد القطع المرجعة (الكل)</p>
          <p className="tnum mt-1 text-xl font-bold text-brand">{totalPieces.toLocaleString('en-US')}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">إجمالي قيمة المرتجعات (الكل)</p>
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
                    <ConfirmButton
                      label="حذف"
                      message={`حذف المرتجع ${r.number}؟ الحذف لا يسحب البضاعة من المخزون ولا يلغي رد المبلغ — صحّحهما يدوياً إن لزم.`}
                    />
                  </form>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Pager basePath="/returns" query={query} count={listCount} />
      <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
        المرتجع يعيد البضاعة للمخزون ويُخصم من مبيعات المندوب (منشئ الفاتورة) في تحليل الموظفين.
      </p>
    </AppShell>
  );
}
