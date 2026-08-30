import type { Metadata } from 'next';
import Link from 'next/link';
import { MANUAL_ORDER_SOURCES, ORDER_SOURCE_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { nextCode } from '@/lib/audit';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DocumentForm, type DocLine } from '@/app/(erp)/sales/DocumentForm';
import { loadSalesOptions } from '@/app/(erp)/sales/options';
import { createSalesInvoice } from '../actions';
import type { SearchParams } from '@/lib/query';

export const metadata: Metadata = { title: 'فاتورة مبيعات جديدة' };

const emptyLine = (variantId: string, quantity: number): DocLine => ({
  productId: '',
  colorId: '',
  sizeId: '',
  variantId,
  service: '',
  quantity,
  unitPrice: 0,
  discountAmount: 0,
  taxRate: 0,
  notes: '',
});

/**
 * فاتورة مبيعات مباشرة — بنفس فورم المبيعات المبسّط.
 *
 * حين تُفتح من طلب موقع (?webOrder=)، تُملأ مسبقاً بعميل الطلب وأصنافه
 * وكمياته: يُنشأ العميل من رقمه إن لم يوجد، وتُبنى السطور من متغيّراتها. يختار
 * المندوب الخدمة فيُحسب السعر، ثم يُصدرها — وعندها يُوسَم الطلب «تحوّل لفاتورة».
 */
export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('invoices.write');
  const params = await searchParams;
  const webOrderId = Array.isArray(params.webOrder) ? params.webOrder[0] : params.webOrder;

  const options = await loadSalesOptions(user.tenantId);

  let prefillCustomerId: string | null = null;
  let prefillLines: DocLine[] | undefined;

  if (webOrderId) {
    const order = await prisma.webOrder.findFirst({
      where: { id: webOrderId, tenantId: user.tenantId, status: 'PENDING' },
      include: { lines: true },
    });
    if (order) {
      // عميل الطلب: يُطابَق برقمه أو يُنشأ. رقم الجوال يعرّف العميل في هذا السوق.
      const existing = await prisma.customer.findFirst({
        where: { tenantId: user.tenantId, phone: order.phone, isDeleted: false },
        select: { id: true },
      });
      if (existing) {
        prefillCustomerId = existing.id;
      } else {
        const codes = await prisma.customer.findMany({
          where: { tenantId: user.tenantId },
          select: { code: true },
        });
        const created = await prisma.customer.create({
          data: {
            tenantId: user.tenantId,
            code: await nextCode('CUS', codes),
            contactName: order.customerName,
            companyName: order.company,
            phone: order.phone,
            whatsapp: order.phone,
            notes: `أُنشئ من طلب الموقع ${order.number}.`,
          },
          select: { id: true },
        });
        prefillCustomerId = created.id;
      }

      // السطور: فقط ما طابق متغيّراً معروفاً — يملؤها DocumentForm من المتغيّر.
      const lines = order.lines
        .filter((l) => l.variantId)
        .map((l) => emptyLine(l.variantId!, l.quantity));
      if (lines.length > 0) prefillLines = lines;
    }
  }

  return (
    <AppShell user={user} title="فاتورة مبيعات جديدة">
      <ModuleHeader
        title={webOrderId ? 'فاتورة من طلب موقع' : 'فاتورة مبيعات جديدة'}
        action={
          <Link href={webOrderId ? '/sales/web-orders' : '/invoices'} className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card max-w-4xl p-6">
        <DocumentForm
          action={createSalesInvoice}
          customers={options.customers}
          variants={options.variants}
          bundles={options.bundles}
          values={
            prefillCustomerId || prefillLines
              ? { customerId: prefillCustomerId, lines: prefillLines }
              : undefined
          }
          webOrderId={webOrderId ?? undefined}
          sources={MANUAL_ORDER_SOURCES.map((s) => ({ value: s, label: ORDER_SOURCE_AR[s] }))}
          labels={{ dateA: 'تاريخ الإصدار', dateB: 'تاريخ الاستحقاق' }}
          submitLabel="إنشاء الفاتورة"
          instantIssue
        />
        <p className="mt-4 text-[0.7rem] text-txt-4">
          {webOrderId
            ? 'اختر الخدمة لكل صنف فيُحسب السعر، ثم أنشئ الفاتورة — يُوسَم طلب الموقع تلقائياً.'
            : 'تُنشأ الفاتورة كمسوّدة، ثم تُصدَّر من صفحتها ليُخصَّص لها الرقم المتسلسل.'}
        </p>
      </div>
    </AppShell>
  );
}
