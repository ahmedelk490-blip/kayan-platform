import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatMoney, QUOTATION_STATUS_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { PrintDocument } from '@/components/print/PrintDocument';
import { PrintActions } from '@/components/print/PrintActions';

export const metadata: Metadata = { title: 'طباعة عرض السعر' };

/**
 * صفحة طباعة عرض السعر.
 *
 * Same document component as the invoice, and the same snapshot discipline:
 * the prices printed are the ones stored on the quotation lines, so a
 * customer holding a printed quotation and the system agree even after the
 * price list moves.
 */
export default async function QuotationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('sales.documents');
  const { id } = await params;

  const [quotation, company] = await Promise.all([
    prisma.quotation.findFirst({
      where: { id, tenantId: user.tenantId, isDeleted: false },
      include: {
        customer: true,
        lines: {
          orderBy: { lineNo: 'asc' },
          include: {
            product: { select: { nameAr: true } },
            variant: {
              include: {
                color: { select: { nameAr: true } },
                size: { select: { code: true } },
              },
            },
          },
        },
      },
    }),
    prisma.company.findFirst({ where: { tenantId: user.tenantId } }),
  ]);
  if (!quotation) notFound();

  const expired =
    quotation.expiryDate !== null && quotation.expiryDate.getTime() < Date.now();

  // A quotation the customer can no longer act on must say so on the paper,
  // not only on the screen it was printed from.
  const statusNote =
    quotation.status === 'DRAFT'
      ? 'مسودة — لم تُرسل للعميل بعد.'
      : quotation.status === 'REJECTED'
        ? 'مرفوض.'
        : expired && quotation.status !== 'CONVERTED'
          ? `انتهت صلاحية هذا العرض في ${quotation.expiryDate!.toLocaleDateString('ar-EG')}.`
          : null;

  const shareText = [
    `عرض سعر ${quotation.number}`,
    company?.nameAr ?? 'كيان',
    `الإجمالي: ${formatMoney(quotation.total)} ${company?.currency ?? 'EGP'}`,
    quotation.expiryDate
      ? `صالح حتى: ${quotation.expiryDate.toLocaleDateString('ar-EG')}`
      : '',
    QUOTATION_STATUS_AR[quotation.status as keyof typeof QUOTATION_STATUS_AR] ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <main className="min-h-screen bg-canvas py-6 print:bg-white print:py-0">
      <PrintActions shareText={shareText} backHref={`/sales/quotations/${quotation.id}`} />

      <PrintDocument
        kind="quotation"
        number={quotation.number}
        issueDate={quotation.issueDate}
        dueDate={quotation.expiryDate}
        statusNote={statusNote}
        company={{
          name: company?.nameAr ?? 'كيان',
          currency: company?.currency ?? 'EGP',
          taxNumber: company?.taxNumber,
          commercialRegister: company?.commercialRegister,
        }}
        party={{
          name: quotation.customer.companyName ?? quotation.customer.contactName,
          phone: quotation.customer.phone,
          address: quotation.customer.address,
          taxNumber: quotation.customer.taxNumber,
        }}
        lines={quotation.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          description: [l.product.nameAr, l.variant.color?.nameAr, l.variant.size?.code]
            .filter(Boolean)
            .join(' · '),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        }))}
        subtotal={quotation.subtotal}
        discountAmount={quotation.discountAmount}
        taxAmount={quotation.taxAmount}
        total={quotation.total}
        notes={quotation.notes}
      />
    </main>
  );
}
