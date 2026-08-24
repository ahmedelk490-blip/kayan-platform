import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DocumentForm } from '../../DocumentForm';
import { loadSalesOptions } from '../../options';
import { createQuotation } from '../actions';

export const metadata: Metadata = { title: 'عرض سعر جديد' };

export default async function NewQuotationPage() {
  const user = await requirePermission('sales.write');
  const options = await loadSalesOptions(user.tenantId);

  return (
    <AppShell user={user} title="عرض سعر جديد">
      <ModuleHeader
        title="عرض سعر جديد"
        action={
          <Link href="/sales/quotations" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card p-6">
        <DocumentForm
          action={createQuotation}
          customers={options.customers}
          variants={options.variants}
          bundles={options.bundles}
          labels={{ dateA: 'تاريخ الإصدار', dateB: 'تاريخ الانتهاء' }}
          submitLabel="إنشاء عرض السعر"
        />
      </div>
    </AppShell>
  );
}
