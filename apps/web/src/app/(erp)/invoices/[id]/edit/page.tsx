import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DocumentForm, type DocLine } from '@/app/(erp)/sales/DocumentForm';
import { loadSalesOptions } from '@/app/(erp)/sales/options';
import { updateInvoiceLines } from '../../actions';

export const metadata: Metadata = { title: 'تعديل بنود الفاتورة' };

/**
 * تعديل بنود فاتورة قائمة — تغيير الأعداد وإضافة/حذف أصناف على نفس فاتورة
 * العميل. يُعاد استخدام فورم المبيعات نفسه مُهيّأً ببنود الفاتورة الحالية.
 */
export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('invoices.write');
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });
  if (!invoice) notFound();
  if (invoice.status === 'VOID') redirect(`/invoices/${id}`);

  const options = await loadSalesOptions(user.tenantId);

  // بنود الفاتورة → سطور الفورم. hydrate يملأ المنتج/اللون/المقاس من المتغيّر.
  const lines: DocLine[] = invoice.lines.map((l) => ({
    productId: '',
    colorId: '',
    sizeId: '',
    variantId: l.variantId ?? '',
    service: '',
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    discountAmount: Number(l.discountAmount),
    taxRate: Number(l.taxRate),
    notes: '',
  }));

  const label = invoice.number ?? 'مسودة';

  return (
    <AppShell user={user} title={`تعديل بنود الفاتورة ${label}`}>
      <ModuleHeader
        title={`تعديل بنود الفاتورة ${label}`}
        action={<Link href={`/invoices/${id}`} className="erp-btn-ghost">رجوع للفاتورة</Link>}
      />

      <div className="erp-card p-6">
        <DocumentForm
          action={updateInvoiceLines.bind(null, id)}
          customers={options.customers}
          variants={options.variants}
          bundles={options.bundles}
          values={{
            customerId: invoice.customerId,
            notes: invoice.notes,
            discountAmount: Number(invoice.discountAmount),
            lines,
          }}
          labels={{ dateA: 'تاريخ الإصدار', dateB: 'تاريخ الاستحقاق' }}
          submitLabel="حفظ التعديلات"
        />
        <p className="mt-4 text-[0.7rem] leading-[1.9] text-txt-4">
          غيّر الأعداد أو أضِف أصنافاً على نفس فاتورة العميل. يُعاد حساب الإجمالي والمتبقّي تلقائياً،
          ويُسوّى المخزون بفرق الكميات (ما زاد يُصرَف وما نقص يعود). العميل ثابت لهذه الفاتورة.
        </p>
      </div>
    </AppShell>
  );
}
