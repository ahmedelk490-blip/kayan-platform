import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  can,
  dec,
  formatQty,
  formatMoney,
  PRODUCTION_TRANSITIONS,
  PRODUCTION_STATUS_AR,
  ORDER_STATUS_AR,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_AR,
  isProductionStatus,
  type ProductionStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { ProductionBadge, PriorityBadge, WorkOrderBadge } from '../StatusBadge';
import { WorkOrderForm } from '../WorkOrderForm';
import { CostBreakdown } from '../CostBreakdown';
import { calculateProductionCost } from '../cost-actions';
import {
  changeProductionStatus,
  deleteProductionOrder,
  addWorkOrder,
  setWorkOrderStatus,
} from '../actions';

export const metadata: Metadata = { title: 'أمر الإنتاج' };

export default async function ProductionOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('manufacturing.view');
  const { id } = await params;

  const order = await prisma.productionOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      product: { select: { nameAr: true } },
      variant: {
        include: { color: { select: { nameAr: true } }, size: { select: { code: true } } },
      },
      customer: { select: { id: true, contactName: true, companyName: true } },
      salesOrder: { select: { id: true, number: true, status: true } },
      workOrders: { orderBy: { sequence: 'asc' } },
      assignees: { include: { user: { select: { nameAr: true, name: true } } } },
      movements: { orderBy: { createdAt: 'asc' }, include: { warehouse: { select: { nameAr: true } } } },
      costCalculations: {
        orderBy: { computedAt: 'desc' },
        include: { lines: { orderBy: { sequence: 'asc' } }, formulas: true },
      },
    },
  });
  if (!order) notFound();

  const canWrite = can(user.role, 'manufacturing.write');
  const canConfirm = can(user.role, 'manufacturing.confirm');
  const canCost = can(user.role, 'cost.view');
  const canMargin = can(user.role, 'cost.margin');

  // The newest calculation is what the page shows. Older ones are kept and
  // never altered — they are the audit trail of what was believed and when.
  const latestCost = order.costCalculations[0] ?? null;
  const assignedFormulas = canCost
    ? await prisma.productFormula.count({
        where: {
          productId: order.productId,
          OR: [{ variantId: null }, { variantId: order.variantId }],
          formula: { isDeleted: false, currentVersionId: { not: null } },
        },
      })
    : 0;
  const status: ProductionStatus = isProductionStatus(order.status) ? order.status : 'DRAFT';
  const nextStates = PRODUCTION_TRANSITIONS[status].filter((s) => s !== 'CANCELLED');
  const canCancel = PRODUCTION_TRANSITIONS[status].includes('CANCELLED');

  return (
    <AppShell user={user} title={order.number}>
      <ModuleHeader
        title={order.number}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/manufacturing" className="erp-btn-ghost">
              رجوع
            </Link>
            {canWrite && status === 'DRAFT' && (
              <Link href={`/manufacturing/${order.id}/edit`} className="erp-btn-ghost">
                تعديل
              </Link>
            )}
            {canConfirm && canCancel && (
              <form action={changeProductionStatus.bind(null, order.id, 'CANCELLED')}>
                <button
                  type="submit"
                  className="rounded-lg border border-bad px-4 py-2 text-xs text-bad hover:bg-bad-soft"
                >
                  إلغاء الأمر
                </button>
              </form>
            )}
            {canWrite && (status === 'DRAFT' || status === 'CANCELLED') && (
              <form action={deleteProductionOrder.bind(null, order.id)}>
                <button type="submit" className="erp-btn-ghost">
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-txt-3">
        <ProductionBadge status={order.status} />
        <PriorityBadge priority={order.priority} />
        <span>
          {order.product.nameAr}
          {order.variant.color && ` · ${order.variant.color.nameAr}`}
          {order.variant.size && ` · ${order.variant.size.code}`}
        </span>
        <span dir="ltr" className="text-txt-4">
          {order.variant.sku}
        </span>
        <span className="tnum">الكمية: {formatQty(order.quantity)}</span>
        {order.salesOrder && (
          <Link href={`/sales/orders/${order.salesOrder.id}`} className="text-brand underline">
            أمر البيع {order.salesOrder.number} —{' '}
            {(ORDER_STATUS_AR as Record<string, string>)[order.salesOrder.status]}
          </Link>
        )}
        {order.customer && (
          <Link href={`/customers/${order.customer.id}`} className="text-brand underline">
            {order.customer.companyName ?? order.customer.contactName}
          </Link>
        )}
      </div>

      {canConfirm && nextStates.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-txt-3">تغيير الحالة:</span>
          {nextStates.map((s) => (
            <form key={s} action={changeProductionStatus.bind(null, order.id, s)}>
              <button type="submit" className="erp-btn">
                {PRODUCTION_STATUS_AR[s]}
              </button>
            </form>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">خطوات التشغيل</h3>
            <Table
              headers={['#', 'الخطوة', 'الحالة', 'البداية', 'النهاية', '']}
              empty={order.workOrders.length === 0}
            >
              {order.workOrders.map((w) => (
                <tr key={w.id}>
                  <td className="tnum px-4 py-3 text-txt-3">{w.sequence}</td>
                  <td className="px-4 py-3 text-txt">{w.name}</td>
                  <td className="px-4 py-3">
                    <WorkOrderBadge status={w.status} />
                  </td>
                  <td className="tnum px-4 py-3 text-txt-3">
                    {w.actualStartDate ? w.actualStartDate.toLocaleDateString('ar-EG') : '—'}
                  </td>
                  <td className="tnum px-4 py-3 text-txt-3">
                    {w.actualEndDate ? w.actualEndDate.toLocaleDateString('ar-EG') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {canWrite && (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {WORK_ORDER_STATUSES.filter((s) => s !== w.status).map((s) => (
                          <form
                            key={s}
                            action={setWorkOrderStatus.bind(null, order.id, w.id, s)}
                          >
                            <button
                              type="submit"
                              className="rounded-md border border-line-2 px-2 py-1 text-[0.7rem] text-txt-3 hover:border-brand hover:text-brand"
                            >
                              {WORK_ORDER_STATUS_AR[s]}
                            </button>
                          </form>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>

            {canWrite && status !== 'COMPLETED' && status !== 'CANCELLED' && (
              <div className="erp-card mt-4 p-5">
                <WorkOrderForm action={addWorkOrder.bind(null, order.id)} />
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">حركات المخزون</h3>
            {order.movements.length === 0 ? (
              <p className="erp-card p-5 text-sm text-txt-3">
                لا توجد حركات بعد. حركة استلام الإنتاج التام تُسجَّل عند إتمام الأمر.
              </p>
            ) : (
              <Table headers={['النوع', 'المخزن', 'الكمية', 'التاريخ']} empty={false}>
                {order.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-txt-2">
                      {m.type === 'RECEIPT' ? 'استلام إنتاج تام' : m.type}
                    </td>
                    <td className="px-4 py-3 text-txt-3">{m.warehouse.nameAr}</td>
                    <td
                      className={`tnum px-4 py-3 ${dec(m.quantity).isNegative() ? 'text-bad' : 'text-ok'}`}
                    >
                      {dec(m.quantity).gt(0) ? `+${formatQty(m.quantity)}` : formatQty(m.quantity)}
                    </td>
                    <td className="tnum px-4 py-3 text-txt-3">
                      {m.createdAt.toLocaleDateString('ar-EG')}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            <p className="mt-2 text-[0.7rem] text-txt-4">
              لا تُسجَّل حركة صرف خامات تلقائياً بعد. محرك المعادلات يحسب الاستهلاك، لكن
              ربطه بحركة صرف فعلية من المخزون يحتاج ربط بنود المعادلة بالخامات المخزنية —
              وهي خطوة لاحقة مقصودة.
            </p>
          </section>

          {canCost && latestCost && (
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-brand">تفصيل التكلفة</h3>
                {order.costCalculations.length > 1 && (
                  <span className="text-[0.7rem] text-txt-4">
                    {order.costCalculations.length} حساب محفوظ — يُعرض الأحدث
                  </span>
                )}
              </div>
              <CostBreakdown calculation={latestCost} showMargin={canMargin} />
              <p className="mt-3 text-[0.7rem] text-txt-4">
                هذه لقطة محفوظة وقت الحساب. تعديل المعادلة أو نشر إصدار جديد لا يغيّر هذا
                الرقم — الحساب لا يُعاد أبداً في مكانه.
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">المواعيد</h3>
            <dl className="space-y-2 text-sm">
              <DateRow label="بداية مخططة" value={order.plannedStartDate} />
              <DateRow label="نهاية مخططة" value={order.plannedEndDate} />
              <DateRow label="بداية فعلية" value={order.actualStartDate} />
              <DateRow label="نهاية فعلية" value={order.actualEndDate} />
            </dl>
          </section>

          {canCost && (
            <section className="erp-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-brand">التكلفة</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-txt-3">تكلفة تقديرية</dt>
                  <dd className="tnum text-txt-2">
                    {order.estimatedCost === null ? '—' : formatMoney(order.estimatedCost)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-txt-3">تكلفة فعلية</dt>
                  <dd className="tnum text-txt-2">
                    {order.actualCost === null ? '—' : formatMoney(order.actualCost)}
                  </dd>
                </div>
              </dl>

              {canWrite && (
                <form
                  action={calculateProductionCost.bind(null, order.id)}
                  className="mt-4 space-y-3 border-t border-line pt-4"
                >
                  <label htmlFor="targetMarginPercent" className="block text-xs text-txt-2">
                    هامش مستهدف ٪ (اختياري)
                  </label>
                  <input
                    id="targetMarginPercent"
                    name="targetMarginPercent"
                    type="number"
                    dir="ltr"
                    min="0"
                    max="99"
                    step="0.1"
                    placeholder="اتركه فارغاً بلا اقتراح سعر"
                    className="erp-input py-2"
                  />
                  <button type="submit" className="erp-btn w-full">
                    {order.status === 'COMPLETED' ? 'حساب التكلفة الفعلية' : 'حساب التكلفة التقديرية'}
                  </button>
                </form>
              )}

              {assignedFormulas === 0 && (
                <p className="mt-3 text-[0.7rem] text-warn">
                  لا توجد معادلة منشورة مرتبطة بهذا المنتج. الحساب سينتج صفراً حتى تُربط
                  معادلة وتُنشر.
                </p>
              )}
            </section>
          )}

          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">العاملون المكلَّفون</h3>
            {order.assignees.length === 0 ? (
              <p className="text-[0.7rem] text-txt-4">
                لا يوجد تكليف. العلاقة جاهزة في قاعدة البيانات، وشاشة التكليف تأتي مع
                وحدة الموارد البشرية.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm text-txt-2">
                {order.assignees.map((a) => (
                  <li key={a.userId}>
                    {a.user.nameAr ?? a.user.name}
                    {a.role && <span className="ms-2 text-[0.7rem] text-txt-4">{a.role}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {order.notes && (
            <section className="erp-card p-5">
              <h3 className="mb-2 text-sm font-semibold text-brand">ملاحظات</h3>
              <p className="whitespace-pre-wrap text-sm text-txt-2">{order.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function DateRow({ label, value }: { label: string; value: Date | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-txt-3">{label}</dt>
      <dd className="tnum text-txt-2">{value ? value.toLocaleDateString('ar-EG') : '—'}</dd>
    </div>
  );
}
