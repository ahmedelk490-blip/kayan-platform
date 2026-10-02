import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DocumentForm, type DocLine } from '@/app/(erp)/sales/DocumentForm';
import { loadSalesOptions } from '@/app/(erp)/sales/options';
import { PRICE_SERVICE_AR } from '@erp/domain';
import { isDeliveryDesc } from '@/lib/delivery';
import { dateTimeInput } from '@/lib/ops';
import { deliveryExpenseTag } from '../../shared';
import { updateInvoiceLines } from '../../actions';

export const metadata: Metadata = { title: 'تعديل بنود الفاتورة' };

const SERVICE_BY_AR = new Map(Object.entries(PRICE_SERVICE_AR).map(([key, ar]) => [ar, key]));

/**
 * الخدمة والتفاصيل من وصف البند المجمّد: «منتج · لون · مقاس — تطريز — تفاصيل».
 *
 * كانت سطور التعديل تُبنى بخدمةٍ وتفاصيل فارغة، فكل حفظٍ يمحو «— تطريز» وما
 * كتبه البائع من الوصف — ويختفي نوع الخدمة من الفاتورة بعد أول تعديل.
 */
function splitDescription(description: string): { service: string; notes: string } {
  const parts = description.split(' — ');
  parts.shift(); // المنتج · اللون · المقاس
  const service = parts[0] ? SERVICE_BY_AR.get(parts[0]) : undefined;
  if (service) parts.shift();
  return { service: service ?? '', notes: parts.join(' — ') };
}

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

  // أصناف الفاتورة نفسها ولو حُذف لونها أو مقاسها من المنتج بعد بيعها.
  const options = await loadSalesOptions(
    user.tenantId,
    invoice.lines.flatMap((l) => (l.variantId ? [l.variantId] : [])),
  );

  // بنود الفاتورة → سطور الفورم. hydrate يملأ المنتج/اللون/المقاس من المتغيّر.
  // بند التوصيل (بلا متغيّر) لا يدخل السطور — تُدار قيمته من خانة 🚚 أدناه.
  const lines: DocLine[] = invoice.lines
    .filter((l) => l.variantId)
    .map((l) => ({
      productId: '',
      colorId: '',
      sizeId: '',
      variantId: l.variantId ?? '',
      ...splitDescription(l.description),
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      discountAmount: Number(l.discountAmount),
      taxRate: Number(l.taxRate),
    }));

  // توصيل الفاتورة الحالي: بند 🚚 (على الزبون)، وإلا مصروف الشحن الموسوم
  // بمعرّفها (علينا) — فتفتح الخانة على وضعها الحقيقي ويعدّلها المستخدم بحرية.
  const deliveryLine = invoice.lines.find((l) => !l.variantId && isDeliveryDesc(l.description));
  let deliveryFee = deliveryLine ? Number(deliveryLine.unitPrice) : 0;
  let deliveryOn: 'CUSTOMER' | 'US' = 'CUSTOMER';
  if (!deliveryLine) {
    const shipExpense = await prisma.secondaryExpense.findFirst({
      where: {
        tenantId: user.tenantId,
        category: 'SHIPPING',
        isDeleted: false,
        notes: { contains: deliveryExpenseTag(invoice.id) },
      },
      select: { amount: true },
    });
    if (shipExpense) {
      deliveryFee = Number(shipExpense.amount);
      deliveryOn = 'US';
    }
  }

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
            deliveryFee,
            deliveryOn,
            // تاريخ الفاتورة الحالي — يغيّره البائع عند الحاجة (المسوّدة يعطيها الإصدار تاريخها).
            dateA: invoice.issueDate ? dateTimeInput(invoice.issueDate) : undefined,
          }}
          labels={{ dateA: 'تاريخ الإصدار', dateB: 'تاريخ الاستحقاق' }}
          submitLabel="حفظ التعديلات"
          withDelivery
        />
        <p className="mt-4 text-[0.7rem] leading-[1.9] text-txt-4">
          غيّر الأعداد أو أضِف أصنافاً على نفس فاتورة العميل. يُعاد حساب الإجمالي والمتبقّي تلقائياً،
          ويُسوّى المخزون بفرق الكميات (ما زاد يُصرَف وما نقص يعود). العميل ثابت لهذه الفاتورة.
          سعر التوصيل يُعدَّل من خانة 🚚: «على الزبون» يعدّل بند التوصيل والإجمالي، و«علينا» يحدّث
          مصروف الشحن ما دام بانتظار الاعتماد — والمصروف المعتمد لا يُمسّ.
        </p>
      </div>
    </AppShell>
  );
}
