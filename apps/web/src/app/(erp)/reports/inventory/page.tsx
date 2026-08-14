import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, formatQty, valuation, available, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { Figure, Empty } from '../Shell';

export const metadata: Metadata = { title: 'تقييم المخزون' };

/**
 * تقييم المخزون — الرصيد الحالي بالتكلفة.
 *
 * Deliberately has no period filter: stock is a position, not a flow. "How
 * much stock did we hold in March" is a different report needing historical
 * snapshots this system does not keep, and offering a period control here
 * would imply an answer it cannot give.
 */
export default async function InventoryReport() {
  const user = await requirePermission('reports.view');

  const [stock, supplies] = await Promise.all([
    prisma.stock.findMany({
      where: { warehouse: { tenantId: user.tenantId, isDeleted: false } },
      include: {
        warehouse: { select: { nameAr: true } },
        variant: {
          include: {
            product: { select: { nameAr: true, cost: true } },
            color: { select: { nameAr: true } },
            size: { select: { code: true } },
          },
        },
      },
    }),
    prisma.supply.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      select: { nameAr: true, code: true, onHand: true, avgCost: true, lastUnitCost: true, unit: true },
    }),
  ]);

  // Variant cost first, product cost as the fallback — the variant is the
  // thing actually held, so its own cost is the truer figure when set.
  const stockRows = stock.map((s) => ({
    onHand: s.onHand,
    unitCost: s.variant.cost ?? s.variant.product.cost ?? null,
  }));
  const stockValue = valuation(stockRows);

  // Supplies value on weighted average, falling back to the last purchase.
  const supplyValue = valuation(
    supplies.map((s) => ({ onHand: s.onHand, unitCost: dec(s.avgCost).gt(0) ? s.avgCost : s.lastUnitCost })),
  );

  const empty = stock.length === 0 && supplies.length === 0;

  return (
    <AppShell user={user} title="تقييم المخزون">
      <ModuleHeader
        title="تقييم المخزون"
        action={
          <Link href="/reports" className="erp-btn-ghost">
            كل التقارير
          </Link>
        }
      />

      {empty ? (
        <Empty what="أرصدة مخزون" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure
              label="قيمة المنتجات الجاهزة"
              value={formatMoney(stockValue.value)}
              hint={`${formatQty(stockValue.units)} وحدة`}
              strong
            />
            <Figure
              label="قيمة المستلزمات"
              value={formatMoney(supplyValue.value)}
              hint={`${formatQty(supplyValue.units)} وحدة`}
              strong
            />
            <Figure
              label="الإجمالي"
              value={formatMoney(dec(stockValue.value).plus(supplyValue.value))}
              strong
            />
            <Figure
              label="أصناف بلا تكلفة"
              value={String(stockValue.unpricedRows + supplyValue.unpricedRows)}
              hint="لا تدخل في القيمة أعلاه"
              tone={stockValue.unpricedRows + supplyValue.unpricedRows > 0 ? 'warn' : undefined}
            />
          </div>

          {stockValue.unpricedRows + supplyValue.unpricedRows > 0 && (
            <p className="mb-8 rounded-lg border border-warn bg-warn-soft px-4 py-3 text-xs leading-[1.9] text-warn">
              {stockValue.unpricedRows + supplyValue.unpricedRows} صنفاً يحمل رصيداً بلا تكلفة
              معروفة، فلم يُحتسب في القيمة. لم أعامل التكلفة المجهولة كصفر — ذلك يُنقص قيمة
              المخزون بصمت، وهو خطأ لا يظهر إلا عند الجرد.
            </p>
          )}

          <section className="mb-8">
            <h3 className="mb-3 text-sm font-semibold text-brand">أرصدة المنتجات</h3>
            <Table
              headers={['المنتج', 'المخزن', 'الرصيد', 'محجوز', 'المتاح', 'تكلفة الوحدة', 'القيمة']}
              empty={stock.length === 0}
            >
              {stock.map((s) => {
                const cost = s.variant.cost ?? s.variant.product.cost ?? null;
                const label = [s.variant.product.nameAr, s.variant.color?.nameAr, s.variant.size?.code]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-txt">{label}</td>
                    <td className="px-4 py-3 text-txt-3">{s.warehouse.nameAr}</td>
                    <td className="tnum px-4 py-3 text-txt-2">{formatQty(s.onHand)}</td>
                    <td className="tnum px-4 py-3 text-txt-3">{formatQty(s.reserved)}</td>
                    <td className="tnum px-4 py-3 text-txt-2">
                      {formatQty(available(s.onHand, s.reserved))}
                    </td>
                    <td className="tnum px-4 py-3 text-txt-3">
                      {cost === null ? <span className="text-warn">غير محدَّدة</span> : formatMoney(cost)}
                    </td>
                    <td className="tnum px-4 py-3 font-medium text-brand">
                      {cost === null ? '—' : formatMoney(dec(s.onHand).times(dec(cost)))}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">أرصدة المستلزمات</h3>
            <Table
              headers={['المستلزم', 'الرصيد', 'الوحدة', 'متوسط التكلفة', 'القيمة']}
              empty={supplies.length === 0}
            >
              {supplies.map((s) => {
                const cost = dec(s.avgCost).gt(0) ? s.avgCost : s.lastUnitCost;
                return (
                  <tr key={s.code}>
                    <td className="px-4 py-3 text-txt">
                      {s.nameAr}
                      <span dir="ltr" className="ms-2 text-[0.7rem] text-txt-4">
                        {s.code}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-txt-2">{formatQty(s.onHand)}</td>
                    <td className="px-4 py-3 text-txt-3">{s.unit ?? '—'}</td>
                    <td className="tnum px-4 py-3 text-txt-3">
                      {cost === null || dec(cost).lte(0) ? (
                        <span className="text-warn">غير معروفة</span>
                      ) : (
                        formatMoney(cost)
                      )}
                    </td>
                    <td className="tnum px-4 py-3 font-medium text-brand">
                      {cost === null || dec(cost).lte(0)
                        ? '—'
                        : formatMoney(dec(s.onHand).times(dec(cost)))}
                    </td>
                  </tr>
                );
              })}
            </Table>
            <p className="mt-2 text-[0.7rem] text-txt-4">
              متوسط التكلفة يُحدَّث مع كل استلام مشتريات بالمتوسط المرجّح. الأصناف التي لم
              تُستلم عبر أمر شراء بعد لا تحمل متوسطاً.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
