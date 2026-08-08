import type { Metadata } from 'next';
import { can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import { MovementForm } from './MovementForm';
import { reverseMovement } from './actions';
import { TYPE_LABELS } from './types';

export const metadata: Metadata = { title: 'المخزون' };

function variantLabel(v: {
  sku: string;
  color: { nameAr: string } | null;
  size: { code: string } | null;
  product: { nameAr: string };
}) {
  const parts = [v.product.nameAr];
  if (v.color) parts.push(v.color.nameAr);
  if (v.size) parts.push(v.size.code);
  return `${parts.join(' · ')} (${v.sku})`;
}

export default async function InventoryPage() {
  const user = await requirePermission('inventory.read');
  const canWrite = can(user.role, 'inventory.write');

  const [stock, variants, warehouses, locations, movements] = await Promise.all([
    prisma.stock.findMany({
      where: { variant: { product: { tenantId: user.tenantId } } },
      include: {
        variant: { include: { product: true, color: true, size: true } },
        warehouse: true,
        location: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.productVariant.findMany({
      where: { isDeleted: false, product: { tenantId: user.tenantId, isDeleted: false } },
      include: { product: true, color: true, size: true },
      orderBy: { sku: 'asc' },
    }),
    prisma.warehouse.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      orderBy: { code: 'asc' },
    }),
    prisma.warehouseLocation.findMany({
      where: { warehouse: { tenantId: user.tenantId }, isDeleted: false },
      orderBy: { code: 'asc' },
    }),
    prisma.stockMovement.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { occurredAt: 'desc' },
      take: 40,
      include: {
        variant: { include: { product: true, color: true, size: true } },
        warehouse: true,
        location: true,
        user: { select: { nameAr: true, name: true } },
        reversedBy: { select: { id: true } },
      },
    }),
  ]);

  const totals = stock.reduce(
    (acc, s) => ({
      onHand: acc.onHand + s.onHand,
      reserved: acc.reserved + s.reserved,
      damaged: acc.damaged + s.damaged,
    }),
    { onHand: 0, reserved: 0, damaged: 0 },
  );

  const lowStock = stock.filter((s) => s.minStock > 0 && s.onHand <= s.minStock);

  return (
    <AppShell user={user} title="المخزون">
      <ModuleHeader title="المخزون" count={stock.length} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="إجمالي المتاح" value={totals.onHand} />
        <Metric label="محجوز" value={totals.reserved} />
        <Metric label="تالف" value={totals.damaged} />
        <Metric label="تحت الحد الأدنى" value={lowStock.length} tone={lowStock.length > 0 ? 'bad' : 'muted'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">الأرصدة</h3>
            <Table
              headers={['المنتج / المتغيّر', 'المخزن', 'الموقع', 'متاح', 'محجوز', 'تالف', 'الحد الأدنى']}
              empty={stock.length === 0}
            >
              {stock.map((s) => (
                <tr key={s.id} className="hover:bg-card-2">
                  <td className="px-4 py-3 text-txt">{variantLabel(s.variant)}</td>
                  <td className="px-4 py-3 text-txt-2">{s.warehouse.nameAr}</td>
                  <td dir="ltr" className="px-4 py-3 text-start text-txt-3">
                    {s.location?.code ?? '—'}
                  </td>
                  <td className="tnum px-4 py-3 font-medium text-txt">{s.onHand}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{s.reserved}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{s.damaged}</td>
                  <td className="tnum px-4 py-3">
                    {s.minStock > 0 && s.onHand <= s.minStock ? (
                      <Badge tone="bad">{s.minStock}</Badge>
                    ) : (
                      <span className="text-txt-3">{s.minStock}</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">سجل الحركات</h3>
            <Table
              headers={['التاريخ', 'المتغيّر', 'النوع', 'الكمية', 'المخزن', 'المرجع', 'المستخدم', '']}
              empty={movements.length === 0}
            >
              {movements.map((m) => (
                <tr key={m.id} className={m.reversedBy ? 'opacity-55 hover:bg-card-2' : 'hover:bg-card-2'}>
                  <td className="tnum px-4 py-3 text-txt-3">
                    {m.occurredAt.toLocaleDateString('ar-EG')}
                  </td>
                  <td className="px-4 py-3 text-txt-2">{variantLabel(m.variant)}</td>
                  <td className="px-4 py-3 text-txt-2">{TYPE_LABELS[m.type] ?? m.type}</td>
                  <td
                    className={`tnum px-4 py-3 font-medium ${m.quantity < 0 ? 'text-bad' : 'text-ok'}`}
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="px-4 py-3 text-txt-3">{m.warehouse.nameAr}</td>
                  <td className="px-4 py-3 text-txt-3">{m.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-txt-3">{m.user?.nameAr ?? m.user?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-end">
                    {canWrite && !m.reversedBy && m.type !== 'REVERSAL' && (
                      <form action={reverseMovement.bind(null, m.id)}>
                        <button type="submit" className="text-xs text-brand hover:underline">
                          عكس
                        </button>
                      </form>
                    )}
                    {m.reversedBy && <span className="text-[0.7rem] text-txt-4">معكوسة</span>}
                  </td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-[0.7rem] text-txt-4">
              الحركات لا تُحذف نهائياً — التصحيح يتم بحركة عكسية تُشير إلى الأصلية.
            </p>
          </section>
        </div>

        {canWrite && (
          <section className="erp-card h-fit p-6">
            <h3 className="mb-4 text-sm font-semibold text-brand">تسجيل حركة</h3>
            <MovementForm
              variants={variants.map((v) => ({ value: v.id, label: variantLabel(v) }))}
              warehouses={warehouses.map((w) => ({ value: w.id, label: w.nameAr }))}
              locations={locations.map((l) => ({ value: l.id, label: l.code }))}
            />
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'bad' | 'muted' }) {
  return (
    <div className="erp-card p-5">
      <p className="text-xs text-txt-3">{label}</p>
      <p className={`tnum mt-2 text-2xl font-semibold ${tone === 'bad' ? 'text-bad' : 'text-brand'}`}>
        {value}
      </p>
    </div>
  );
}
