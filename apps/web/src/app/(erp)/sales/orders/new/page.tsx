import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DocumentForm } from '../../DocumentForm';
import { loadSalesOptions } from '../../options';
import { createOrder } from '../actions';

export const metadata: Metadata = { title: 'أمر بيع جديد' };

export default async function NewOrderPage() {
  const user = await requirePermission('sales.write');
  const options = await loadSalesOptions(user.tenantId);

  return (
    <AppShell user={user} title="أمر بيع جديد">
      <ModuleHeader
        title="أمر بيع جديد"
        action={
          <Link href="/sales/orders" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card p-6">
        <DocumentForm
          action={createOrder}
          customers={options.customers}
          variants={options.variants}
          bundles={options.bundles}
          labels={{ dateA: 'تاريخ الأمر', dateB: 'تاريخ التسليم المطلوب' }}
          submitLabel="إنشاء أمر البيع"
        />
        <p className="mt-4 text-[0.7rem] text-txt-4">
          الحجز يحدث عند التأكيد، وليس عند الإنشاء.
        </p>
      </div>
    </AppShell>
  );
}
