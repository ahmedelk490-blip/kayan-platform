import type { Metadata } from 'next';
import { can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { WarehouseForm, LocationForm } from './Forms';
import { deleteWarehouse, deleteLocation } from './actions';

export const metadata: Metadata = { title: 'المخازن' };

export default async function WarehousesPage() {
  const user = await requirePermission('inventory.read');
  const canWrite = can(user.role, 'inventory.write');

  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { code: 'asc' },
    include: {
      locations: { where: { isDeleted: false }, orderBy: { code: 'asc' } },
      _count: { select: { stock: true } },
    },
  });

  return (
    <AppShell user={user} title="المخازن">
      <ModuleHeader title="المخازن" count={warehouses.length} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {warehouses.map((w) => (
            <section key={w.id} className="erp-card p-5">
              <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-brand">{w.nameAr}</h3>
                  <p dir="ltr" className="tnum mt-0.5 text-start text-[0.7rem] text-txt-3">
                    {w.code} · {w._count.stock} سجل رصيد
                  </p>
                </div>
                {canWrite && (
                  <form action={deleteWarehouse.bind(null, w.id)}>
                    <button type="submit" className="text-xs text-bad hover:underline">
                      حذف المخزن
                    </button>
                  </form>
                )}
              </header>

              <Table headers={['الرمز', 'الاسم', '']} empty={w.locations.length === 0}>
                {w.locations.map((l) => (
                  <tr key={l.id} className="hover:bg-card-2">
                    <td dir="ltr" className="tnum px-4 py-2.5 text-start text-txt-2">
                      {l.code}
                    </td>
                    <td className="px-4 py-2.5 text-txt-2">{l.nameAr ?? '—'}</td>
                    <td className="px-4 py-2.5 text-end">
                      {canWrite && (
                        <form action={deleteLocation.bind(null, l.id)}>
                          <button type="submit" className="text-xs text-bad hover:underline">
                            حذف
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>

              {canWrite && (
                <div className="mt-4 border-t border-line pt-4">
                  <LocationForm warehouseId={w.id} />
                </div>
              )}
            </section>
          ))}

          {warehouses.length === 0 && (
            <p className="erp-card p-6 text-sm text-txt-3">لا توجد مخازن بعد.</p>
          )}
        </div>

        {canWrite && (
          <section className="erp-card h-fit p-6">
            <h3 className="mb-4 text-sm font-semibold text-brand">مخزن جديد</h3>
            <WarehouseForm />
          </section>
        )}
      </div>
    </AppShell>
  );
}
