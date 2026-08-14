import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { ProductionForm } from '../ProductionForm';
import { loadManufacturingOptions } from '../options';
import { createProductionOrder } from '../actions';
import type { SearchParams } from '@/lib/query';

export const metadata: Metadata = { title: 'أمر إنتاج جديد' };

export default async function NewProductionOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('manufacturing.write');
  const options = await loadManufacturingOptions(user.tenantId);
  const params = await searchParams;

  // Arriving from a sales order pre-selects it, so the link is made by the
  // person who knows it exists rather than re-found in a dropdown.
  const fromOrder = Array.isArray(params.salesOrderId)
    ? params.salesOrderId[0]
    : params.salesOrderId;
  const fromVariant = Array.isArray(params.variantId) ? params.variantId[0] : params.variantId;

  return (
    <AppShell user={user} title="أمر إنتاج جديد">
      <ModuleHeader
        title="أمر إنتاج جديد"
        action={
          <Link href="/manufacturing" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card p-6">
        <ProductionForm
          action={createProductionOrder}
          variants={options.variants}
          salesOrders={options.salesOrders}
          defaults={{ salesOrderId: fromOrder ?? '', variantId: fromVariant ?? '' }}
          submitLabel="إنشاء أمر الإنتاج"
        />
        <p className="mt-4 text-[0.7rem] text-txt-4">
          الأمر يُنشأ كمسودة. التأكيد وبدء التنفيذ خطوات لاحقة على صفحة الأمر.
        </p>
      </div>
    </AppShell>
  );
}
