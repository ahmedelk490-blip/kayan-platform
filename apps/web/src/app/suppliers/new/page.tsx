import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { SupplierForm } from '../SupplierForm';
import { createSupplier } from '../actions';

export const metadata: Metadata = { title: 'مورّد جديد' };

export default async function NewSupplierPage() {
  const user = await requirePermission('suppliers.write');

  return (
    <AppShell user={user} title="مورّد جديد">
      <ModuleHeader
        title="مورّد جديد"
        action={
          <Link href="/suppliers" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card max-w-3xl p-6">
        <SupplierForm action={createSupplier} submitLabel="إنشاء المورّد" />
      </div>
    </AppShell>
  );
}
