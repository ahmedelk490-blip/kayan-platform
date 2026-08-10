import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatMoney, INVOICE_STATUS_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { PrintDocument } from '@/components/print/PrintDocument';
import { PrintActions } from '@/components/print/PrintActions';

export const metadata: Metadata = { title: 'طباعة الفاتورة' };

/**
 * صفحة طباعة الفاتورة.
 *
 * Deliberately outside AppShell: the sidebar and header have no business on
 * paper, and hiding them with CSS after rendering wastes the work. This route
 * renders the document and nothing else.
 *
 * Every figure comes from the stored invoice lines, which were copied at
 * creation. Reprinting a two-year-old invoice must show what the customer was
 * charged, not what the price list says today.
 */
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('invoices.view');
  const { id } = await params;

  const [invoice, company] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId, isDeleted: false },
      include: {
        customer: true,
        lines: { orderBy: { lineNo: 'asc' } },
      },
    }),
    prisma.company.findFirst({ where: { tenantId: user.tenantId } }),
  ]);
  if (!invoice) notFound();

  // A draft has no number yet, and a void invoice must never be mistaken for
  // a live one. Both say so on the page itself, not just on screen.
  const statusNote =
    invoice.status === 'DRAFT'
      ? 'مسودة — لم تُصدر بعد ولا تحمل رقماً ضريبياً. غير صالحة للتقديم.'
      : invoice.status === 'VOID'
        ? `ملغاة${invoice.voidReason ? ` — ${invoice.voidReason}` : ''}. غير مستحقة السداد.`
        : null;

  const shareText = [
    `${INVOICE_STATUS_AR[invoice.status as keyof typeof INVOICE_STATUS_AR] ?? ''} ${invoice.number ?? 'مسودة'}`,
    `${company?.nameAr ?? 'كيان'}`,
    `الإجمالي: ${formatMoney(invoice.total)} ${company?.currency ?? 'EGP'}`,
    invoice.dueDate ? `الاستحقاق: ${invoice.dueDate.toLocaleDateString('ar-EG')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <main className="min-h-screen bg-canvas py-6 print:bg-white print:py-0">
      <PrintActions shareText={shareText} backHref={`/invoices/${invoice.id}`} />

      <PrintDocument
        kind="invoice"
        number={invoice.number ?? 'مسودة'}
        issueDate={invoice.issueDate}
        dueDate={invoice.dueDate}
        statusNote={statusNote}
        company={{
          name: company?.nameAr ?? 'كيان',
          currency: company?.currency ?? 'EGP',
          taxNumber: company?.taxNumber,
          commercialRegister: company?.commercialRegister,
        }}
        party={{
          name: invoice.customer.companyName ?? invoice.customer.contactName,
          phone: invoice.customer.phone,
          address: invoice.customer.address,
          taxNumber: invoice.customer.taxNumber,
        }}
        lines={invoice.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        }))}
        subtotal={invoice.subtotal}
        discountAmount={invoice.discountAmount}
        taxAmount={invoice.taxAmount}
        total={invoice.total}
        paidAmount={invoice.paidAmount}
        notes={invoice.notes}
      />
    </main>
  );
}
