import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DocumentForm } from '@/app/(erp)/sales/DocumentForm';
import { loadSalesOptions } from '@/app/(erp)/sales/options';
import { createSalesInvoice } from '../actions';

export const metadata: Metadata = { title: 'فاتورة مبيعات جديدة' };

/**
 * فاتورة مبيعات مباشرة — بنفس فورم المبيعات المبسّط.
 *
 * تُنشأ مسوّدة ثم تُصدَّر من صفحتها (حيث يُخصَّص الرقم المتسلسل). لا خطوة عرض
 * سعر ولا أمر بيع — هذا ما يحتاجه البيع اليومي.
 */
export default async function NewInvoicePage() {
  const user = await requirePermission('invoices.write');
  const options = await loadSalesOptions(user.tenantId);

  return (
    <AppShell user={user} title="فاتورة مبيعات جديدة">
      <ModuleHeader
        title="فاتورة مبيعات جديدة"
        action={
          <Link href="/invoices" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card max-w-4xl p-6">
        <DocumentForm
          action={createSalesInvoice}
          customers={options.customers}
          variants={options.variants}
          labels={{ dateA: 'تاريخ الإصدار', dateB: 'تاريخ الاستحقاق' }}
          submitLabel="إنشاء الفاتورة"
        />
        <p className="mt-4 text-[0.7rem] text-txt-4">
          تُنشأ الفاتورة كمسوّدة، ثم تُصدَّر من صفحتها ليُخصَّص لها الرقم المتسلسل.
        </p>
      </div>
    </AppShell>
  );
}
