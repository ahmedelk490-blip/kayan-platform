import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { ProductionForm } from '../../ProductionForm';
import { loadManufacturingOptions } from '../../options';
import { updateProductionOrder } from '../../actions';
import { dateInput } from '../../shared';

export const metadata: Metadata = { title: 'تعديل أمر الإنتاج' };

export default async function EditProductionOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('manufacturing.write');
  const { id } = await params;

  const order = await prisma.productionOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!order) notFound();

  // A confirmed order has left the office. Editing quantity or product after
  // that would silently contradict what the floor is already making, so the
  // page refuses rather than showing a form whose submit would be rejected.
  if (order.status !== 'DRAFT') redirect(`/manufacturing/${id}`);

  const options = await loadManufacturingOptions(user.tenantId);

  return (
    <AppShell user={user} title={`تعديل ${order.number}`}>
      <ModuleHeader
        title={`تعديل ${order.number}`}
        action={
          <Link href={`/manufacturing/${id}`} className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card p-6">
        <ProductionForm
          action={updateProductionOrder.bind(null, id)}
          variants={options.variants}
          salesOrders={options.salesOrders}
          defaults={{
            variantId: order.variantId,
            quantity: dec(order.quantity).toNumber(),
            priority: order.priority,
            salesOrderId: order.salesOrderId,
            plannedStartDate: dateInput(order.plannedStartDate),
            plannedEndDate: dateInput(order.plannedEndDate),
            notes: order.notes,
          }}
          submitLabel="حفظ التعديلات"
        />
        <p className="mt-4 text-[0.7rem] text-txt-4">
          التعديل متاح على المسودات فقط. بعد التأكيد يتغيّر الأمر بتغيير الحالة، لا بالتحرير.
        </p>
      </div>
    </AppShell>
  );
}
