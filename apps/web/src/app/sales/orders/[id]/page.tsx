import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  can,
  dec,
  formatMoney,
  formatQty,
  type Numeric,
  ORDER_TRANSITIONS,
  ORDER_STATUS_AR,
  isOrderStatus,
  RESERVING_STATUSES,
  INVOICE_STATUS_AR,
  type OrderStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { StatusBadge } from '../../StatusBadge';
import { ProductionBadge } from '@/app/manufacturing/StatusBadge';
import { createInvoiceFromOrder } from '@/app/invoices/actions';
import { confirmOrder, cancelOrder, changeOrderStatus, deleteOrder } from '../actions';

export const metadata: Metadata = { title: 'أمر البيع' };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('sales.documents');
  const { id } = await params;

  const order = await prisma.salesOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      customer: true,
      quotation: { select: { id: true, number: true } },
      salesRep: { select: { nameAr: true, name: true } },
      lines: {
        orderBy: { lineNo: 'asc' },
        include: {
          product: { select: { nameAr: true } },
          variant: {
            include: { color: { select: { nameAr: true } }, size: { select: { code: true } } },
          },
        },
      },
      movements: {
        orderBy: { createdAt: 'asc' },
        include: { variant: { select: { sku: true } } },
      },
      productionOrders: {
        where: { isDeleted: false },
        orderBy: { number: 'asc' },
        include: {
          product: { select: { nameAr: true } },
          variant: { select: { sku: true } },
        },
      },
      invoices: {
        where: { isDeleted: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true, number: true, status: true, total: true, paidAmount: true },
      },
    },
  });
  if (!order) notFound();

  const canConfirm = can(user.role, 'sales.confirm');
  const canWrite = can(user.role, 'sales.write');
  const canProduce = can(user.role, 'manufacturing.write');
  const canInvoice = can(user.role, 'invoices.write');
  const status = isOrderStatus(order.status) ? (order.status as OrderStatus) : 'DRAFT';
  const nextStates = ORDER_TRANSITIONS[status].filter((s) => s !== 'CANCELLED');
  const holdsReservations = RESERVING_STATUSES.includes(status);

  return (
    <AppShell user={user} title={order.number}>
      <ModuleHeader
        title={order.number}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/sales/orders" className="erp-btn-ghost">
              رجوع
            </Link>
            {canConfirm && status === 'DRAFT' && (
              <form action={confirmOrder.bind(null, order.id)}>
                <button type="submit" className="erp-btn">
                  تأكيد وحجز المخزون
                </button>
              </form>
            )}
            {canConfirm && status !== 'CANCELLED' && status !== 'COMPLETED' && (
              <form action={cancelOrder.bind(null, order.id)}>
                <button
                  type="submit"
                  className="rounded-lg border border-bad px-4 py-2 text-xs text-bad hover:bg-bad-soft"
                >
                  إلغاء الأمر
                </button>
              </form>
            )}
            {canWrite && !holdsReservations && status !== 'CANCELLED' && (
              <form action={deleteOrder.bind(null, order.id)}>
                <button type="submit" className="erp-btn-ghost">
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-txt-3">
        <StatusBadge status={order.status} kind="order" />
        <span>{order.customer.companyName ?? order.customer.contactName}</span>
        <span className="tnum">{order.orderDate.toLocaleDateString('ar-EG')}</span>
        {order.requiredDeliveryDate && (
          <span className="tnum">
            التسليم: {order.requiredDeliveryDate.toLocaleDateString('ar-EG')}
          </span>
        )}
        {order.quotation && (
          <Link href={`/sales/quotations/${order.quotation.id}`} className="text-brand underline">
            من عرض السعر {order.quotation.number}
          </Link>
        )}
      </div>

      {canConfirm && nextStates.length > 0 && status !== 'DRAFT' && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-txt-3">تغيير الحالة:</span>
          {nextStates.map((s) => (
            <form key={s} action={changeOrderStatus.bind(null, order.id, s)}>
              <button type="submit" className="erp-btn-ghost">
                {ORDER_STATUS_AR[s]}
              </button>
            </form>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-brand">البنود</h3>
          <Table headers={['المنتج', 'الكمية', 'سعر الوحدة', 'خصم', 'ضريبة', 'الإجمالي']} empty={order.lines.length === 0}>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 text-txt">
                  {l.product.nameAr}
                  {l.variant.color && ` · ${l.variant.color.nameAr}`}
                  {l.variant.size && ` · ${l.variant.size.code}`}
                  <span dir="ltr" className="ms-2 text-[0.7rem] text-txt-4">
                    {l.variant.sku}
                  </span>
                </td>
                <td className="tnum px-4 py-3 text-txt-2">{formatQty(l.quantity)}</td>
                <td className="tnum px-4 py-3 text-txt-2">{formatMoney(l.unitPrice)}</td>
                <td className="tnum px-4 py-3 text-txt-3">{formatMoney(l.discountAmount)}</td>
                <td className="tnum px-4 py-3 text-txt-3">{formatMoney(l.taxAmount)}</td>
                <td className="tnum px-4 py-3 font-medium text-txt">{formatMoney(l.lineTotal)}</td>
              </tr>
            ))}
          </Table>

          <dl className="erp-card ms-auto max-w-xs space-y-2 p-5 text-sm">
            <Row label="المجموع" value={order.subtotal} />
            <Row label="الخصم" value={dec(order.discountAmount).negated()} />
            <Row label="الضريبة" value={order.taxAmount} />
            <div className="border-t border-line pt-2">
              <Row label="الإجمالي" value={order.total} strong />
            </div>
          </dl>
        </div>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-brand">حركات الحجز</h3>
          {order.movements.length === 0 ? (
            <p className="erp-card p-5 text-sm text-txt-3">
              لا توجد حركات. الحجز يُنشأ عند تأكيد الأمر.
            </p>
          ) : (
            <Table headers={['المتغيّر', 'النوع', 'الكمية', 'التاريخ']} empty={false}>
              {order.movements.map((m) => (
                <tr key={m.id}>
                  <td dir="ltr" className="px-4 py-3 text-start text-txt-2">
                    {m.variant.sku}
                  </td>
                  <td className="px-4 py-3 text-txt-2">
                    {m.type === 'RESERVE' ? 'حجز' : m.type === 'UNRESERVE' ? 'إلغاء حجز' : m.type}
                  </td>
                  <td className={`tnum px-4 py-3 ${dec(m.quantity).isNegative() ? 'text-bad' : 'text-ok'}`}>
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
            الحجز لا يقلل الرصيد المتاح فعلياً — يرفع «محجوز»، والمتاح = المتاح − المحجوز.
          </p>

          <div className="mt-8 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-brand">أوامر الإنتاج</h3>
            {canProduce && status !== 'DRAFT' && status !== 'CANCELLED' && (
              <Link
                href={`/manufacturing/new?salesOrderId=${order.id}`}
                className="text-xs text-brand hover:underline"
              >
                + أمر إنتاج من هذا الأمر
              </Link>
            )}
          </div>
          {order.productionOrders.length === 0 ? (
            <p className="erp-card mt-3 p-5 text-sm text-txt-3">
              لا توجد أوامر إنتاج مرتبطة بهذا الأمر.
            </p>
          ) : (
            <div className="mt-3">
              <Table headers={['الرقم', 'المنتج', 'الكمية', 'الحالة']} empty={false}>
                {order.productionOrders.map((p) => (
                  <tr key={p.id}>
                    <td dir="ltr" className="tnum px-4 py-3 text-start">
                      <Link href={`/manufacturing/${p.id}`} className="text-brand hover:underline">
                        {p.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-txt-2">
                      {p.product.nameAr}
                      <span dir="ltr" className="ms-2 text-[0.7rem] text-txt-4">
                        {p.variant.sku}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-txt-2">{formatQty(p.quantity)}</td>
                    <td className="px-4 py-3">
                      <ProductionBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
          <div className="mt-8 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-brand">الفواتير</h3>
            {canInvoice && status !== 'DRAFT' && status !== 'CANCELLED' && (
              <form action={createInvoiceFromOrder.bind(null, order.id)}>
                <button type="submit" className="text-xs text-brand hover:underline">
                  + إنشاء فاتورة من هذا الأمر
                </button>
              </form>
            )}
          </div>
          {order.invoices.length === 0 ? (
            <p className="erp-card mt-3 p-5 text-sm text-txt-3">
              لا توجد فواتير لهذا الأمر بعد.
            </p>
          ) : (
            <div className="mt-3">
              <Table headers={['الرقم', 'الإجمالي', 'المدفوع', 'الحالة']} empty={false}>
                {order.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td dir="ltr" className="tnum px-4 py-3 text-start">
                      <Link href={`/invoices/${inv.id}`} className="text-brand hover:underline">
                        {inv.number ?? 'مسودة'}
                      </Link>
                    </td>
                    <td className="tnum px-4 py-3 text-txt-2">{formatMoney(inv.total)}</td>
                    <td className="tnum px-4 py-3 text-txt-3">{formatMoney(inv.paidAmount)}</td>
                    <td className="px-4 py-3 text-[0.7rem] text-txt-3">
                      {(INVOICE_STATUS_AR as Record<string, string>)[inv.status] ?? inv.status}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Row({ label, value, strong }: { label: string; value: Numeric; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? 'font-medium text-txt' : 'text-txt-3'}>{label}</dt>
      <dd className={`tnum ${strong ? 'font-semibold text-brand' : 'text-txt-2'}`}>{formatMoney(value)}</dd>
    </div>
  );
}
