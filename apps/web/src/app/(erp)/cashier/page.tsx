import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DocumentForm } from '@/app/(erp)/sales/DocumentForm';
import { loadSalesOptions } from '@/app/(erp)/sales/options';
import { createSalesInvoice } from '../invoices/actions';

export const metadata: Metadata = { title: 'الكاشير' };

/**
 * لوحة الكاشير — بيع وتحصيل في شاشة واحدة.
 *
 * نفس محرّك الفاتورة المباشرة، لكن «إصدار وتحصيل فوري» يبدأ مفعّلاً: الكاشير
 * يختار العميل والأصناف (أو السيريه)، والمبلغ المدفوع، فتخرج فاتورة مُصدَرة
 * ومُحصَّلة بضغطة. للعميل العابر أنشئ عميلاً باسم «عميل نقدي» واستخدمه.
 */
export default async function CashierPage() {
  const user = await requirePermission('invoices.write');
  const options = await loadSalesOptions(user.tenantId);

  return (
    <AppShell user={user} title="الكاشير">
      <ModuleHeader
        title="لوحة الكاشير"
        action={
          <Link href="/invoices" className="erp-btn-ghost">
            الفواتير
          </Link>
        }
      />
      <div className="erp-card max-w-4xl p-6">
        <p className="mb-5 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-xs leading-[1.9] text-txt-2">
          بيع سريع: اختر العميل والأصناف (أو أضِف سيريه)، ثم المبلغ المدفوع — تخرج
          فاتورة مُصدَرة ومُحصَّلة فوراً. «إصدار وتحصيل فوري» مفعّل تلقائياً هنا.
        </p>
        <DocumentForm
          action={createSalesInvoice}
          customers={options.customers}
          variants={options.variants}
          bundles={options.bundles}
          labels={{ dateA: 'تاريخ الإصدار', dateB: 'تاريخ الاستحقاق' }}
          submitLabel="بيع"
          instantIssue
          instantDefault
        />
      </div>
    </AppShell>
  );
}
