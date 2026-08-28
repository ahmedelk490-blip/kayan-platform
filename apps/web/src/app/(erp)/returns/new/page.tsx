import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { ReturnForm, type ReturnLine } from '../ReturnForm';
import { createReturn } from '../actions';

export const metadata: Metadata = { title: 'مرتجع جديد' };

/**
 * مرتجع جديد — خطوتان بلا حالة: بلا ?invoice تُعرض قائمة الفواتير للاختيار،
 * ومعه تُعرض بنود الفاتورة بكمياتها لإدخال المرتجع.
 */
export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('invoices.write');
  const params = await searchParams;
  const invoiceId = Array.isArray(params.invoice) ? params.invoice[0] : params.invoice;

  // الخطوة ٢: فاتورة مختارة — أظهر بنودها.
  if (invoiceId) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
      include: {
        lines: { orderBy: { lineNo: 'asc' } },
        customer: { select: { companyName: true, contactName: true } },
      },
    });
    if (!invoice) notFound();

    // المُرجَع سابقاً لكل بند — ليعرض المتبقّي ويمنع تجاوز المباع.
    const priorReturns = await prisma.salesReturn.findMany({
      where: { tenantId: user.tenantId, invoiceId: invoice.id, isDeleted: false },
      select: { lines: { select: { invoiceLineId: true, quantity: true } } },
    });
    const returnedByLine = new Map<string, number>();
    for (const pr of priorReturns) {
      for (const l of pr.lines) {
        if (!l.invoiceLineId) continue;
        returnedByLine.set(l.invoiceLineId, (returnedByLine.get(l.invoiceLineId) ?? 0) + Number(l.quantity));
      }
    }

    const lines: ReturnLine[] = invoice.lines.map((l) => ({
      id: l.id,
      description: l.description,
      sold: Number(l.quantity),
      returned: returnedByLine.get(l.id) ?? 0,
      unitPrice: Number(l.unitPrice),
    }));

    return (
      <AppShell user={user} title="مرتجع جديد">
        <ModuleHeader
          title={`مرتجع من الفاتورة ${invoice.number ?? ''}`}
          action={<Link href="/returns/new" className="erp-btn-ghost">اختيار فاتورة أخرى</Link>}
        />
        <p className="mb-4 text-xs text-txt-3">
          العميل: <span className="text-txt">{invoice.customer.companyName ?? invoice.customer.contactName}</span>
        </p>
        <div className="erp-card p-6">
          <ReturnForm action={createReturn.bind(null, invoice.id)} lines={lines} />
        </div>
      </AppShell>
    );
  }

  // الخطوة ١: اختيار فاتورة — أحدث الفواتير المُصدَّرة.
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
    orderBy: { issueDate: 'desc' },
    take: 100,
    select: {
      id: true, number: true, total: true, issueDate: true,
      customer: { select: { companyName: true, contactName: true } },
    },
  });

  return (
    <AppShell user={user} title="مرتجع جديد">
      <ModuleHeader
        title="مرتجع جديد — اختر الفاتورة"
        action={<Link href="/returns" className="erp-btn-ghost">رجوع</Link>}
      />
      <Table headers={['الرقم', 'التاريخ', 'العميل', 'الإجمالي', '']} empty={invoices.length === 0}>
        {invoices.map((inv) => (
          <tr key={inv.id} className="hover:bg-card-2">
            <td className="tnum px-4 py-3 text-txt">{inv.number ?? '—'}</td>
            <td className="tnum px-4 py-3 text-txt-3">{inv.issueDate ? inv.issueDate.toLocaleDateString('ar-EG') : '—'}</td>
            <td className="px-4 py-3 text-txt-2">{inv.customer.companyName ?? inv.customer.contactName}</td>
            <td className="tnum px-4 py-3 text-txt-2">{formatMoney(dec(inv.total))}</td>
            <td className="px-4 py-3 text-end">
              <Link href={`/returns/new?invoice=${inv.id}`} className="text-xs font-medium text-brand hover:underline">
                إرجاع من هذه الفاتورة
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </AppShell>
  );
}
