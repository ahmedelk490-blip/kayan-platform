import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { CustomerForm } from '../CustomerForm';
import { createCustomer } from '../actions';

export const metadata: Metadata = { title: 'عميل جديد' };

export default async function NewCustomerPage() {
  const user = await requirePermission('customers.write');

  return (
    <AppShell user={user} title="عميل جديد">
      <ModuleHeader
        title="عميل جديد"
        action={
          <Link href="/customers" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card max-w-3xl p-6">
        <CustomerForm action={createCustomer} submitLabel="إنشاء العميل" />
      </div>
    </AppShell>
  );
}
