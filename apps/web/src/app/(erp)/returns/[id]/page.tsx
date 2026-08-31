import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { categoryOf, categoriesOf } from '../category';

export const metadata: Metadata = { title: 'تفاصيل المرتجع' };

/** تفاصيل مرتجع واحد — ماذا رُجّع بالضبط: الأصناف وتصنيفها وكمياتها وقيمها والسبب. */
export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('returns.view');
  const { id } = await params;

  const ret = await prisma.salesReturn.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { lines: true },
  });
  if (!ret) notFound();

  const pieces = ret.lines.reduce((s, l) => s + Number(l.quantity), 0);
  const categories = categoriesOf(ret.lines.map((l) => l.description));

  return (
    <AppShell user={user} title={`المرتجع ${ret.number}`}>
      <ModuleHeader
        title={`المرتجع ${ret.number}`}
        action={<Link href="/returns" className="erp-btn-ghost">رجوع للمرتجعات</Link>}
      />

      {/* بطاقة المعلومات: التاريخ، الفاتورة، العميل، التصنيف، السبب. */}
      <div className="erp-card mb-6 p-5">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[0.7rem] text-txt-3">التاريخ</dt>
            <dd className="tnum mt-1 text-sm text-txt">{ret.returnDate.toLocaleDateString('ar-EG')}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] text-txt-3">الفاتورة</dt>
            <dd className="tnum mt-1 text-sm">
              <Link href={`/invoices/${ret.invoiceId}`} className="text-brand hover:underline">
                {ret.invoiceNumber ?? '—'}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-[0.7rem] text-txt-3">العميل</dt>
            <dd className="mt-1 text-sm text-txt">{ret.customerName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] text-txt-3">التصنيف</dt>
            <dd className="mt-1 text-sm text-txt">{categories.join(' + ')}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-[0.7rem] text-txt-3">سبب الإرجاع</dt>
            <dd className="mt-1 text-sm leading-[1.8] text-txt">{ret.reason ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* الأصناف المرتجعة — كل سطر بتصنيفه وكميته وسعره. */}
      <div className="erp-card overflow-x-auto p-5">
        <h3 className="mb-3 text-sm font-semibold text-brand">الأصناف المرتجعة</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-[0.7rem] text-txt-3">
              <th className="px-3 py-2 text-start font-medium">الصنف</th>
              <th className="px-3 py-2 text-start font-medium">التصنيف</th>
              <th className="px-3 py-2 text-start font-medium">الكمية</th>
              <th className="px-3 py-2 text-start font-medium">سعر الوحدة</th>
              <th className="px-3 py-2 text-start font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {ret.lines.map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="px-3 py-2.5 text-txt">{l.description}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-block rounded-full border border-line-2 bg-card-2 px-2.5 py-1 text-[0.7rem] text-txt-2">
                    {categoryOf(l.description)}
                  </span>
                </td>
                <td className="tnum px-3 py-2.5 text-txt-2">{Number(l.quantity).toLocaleString('en-US')}</td>
                <td className="tnum px-3 py-2.5 text-txt-3">{formatMoney(dec(l.unitPrice))}</td>
                <td className="tnum px-3 py-2.5 font-medium text-brand">{formatMoney(dec(l.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 py-3 text-sm font-semibold text-txt" colSpan={2}>الإجمالي</td>
              <td className="tnum px-3 py-3 font-semibold text-txt">{pieces.toLocaleString('en-US')} قطعة</td>
              <td />
              <td className="tnum px-3 py-3 text-base font-bold text-brand">{formatMoney(dec(ret.totalAmount))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </AppShell>
  );
}
