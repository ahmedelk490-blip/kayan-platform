import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  can,
  formatMoney,
  formatQty,
  outstanding,
  PURCHASE_STATUS_AR,
  PURCHASE_TRANSITIONS,
  isPurchaseStatus,
  type PurchaseStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { ReceiveForm, type ReceivableLine } from '../ReceiveForm';
import { changePurchaseStatus, deletePurchaseOrder, receiveGoods } from '../actions';

export const metadata: Metadata = { title: 'أمر الشراء' };

const ERRORS: Record<string, string> = {
  received:
    'لا يمكن إلغاء أو حذف أمر عليه استلامات — البضاعة على الرف فعلاً. سجّل مرتجعاً بدلاً من ذلك.',
};

export default async function PurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('purchasing.view');
  const { id } = await params;
  const sp = await searchParams;
  const errKey = Array.isArray(sp.err) ? sp.err[0] : sp.err;

  const order = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      supplier: true,
      createdBy: { select: { nameAr: true, name: true } },
      lines: {
        orderBy: { lineNo: 'asc' },
        include: {
          variant: {
            include: {
              product: { select: { nameAr: true } },
              color: { select: { nameAr: true } },
              size: { select: { code: true } },
            },
          },
          supply: { select: { nameAr: true, code: true, unit: true } },
        },
      },
      receipts: {
        orderBy: { receiptDate: 'desc' },
        include: {
          warehouse: { select: { nameAr: true } },
          receivedBy: { select: { nameAr: true, name: true } },
          lines: true,
        },
      },
    },
  });
  if (!order) notFound();

  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { code: 'asc' },
    select: { id: true, nameAr: true },
  });

  const canWrite = can(user.role, 'purchasing.write');
  const canConfirm = can(user.role, 'purchasing.confirm');
  const canReceive = can(user.role, 'purchasing.receive');

  const status: PurchaseStatus = isPurchaseStatus(order.status) ? order.status : 'DRAFT';
  const open = status === 'CONFIRMED' || status === 'PARTIALLY_RECEIVED';

  const label = (line: (typeof order.lines)[number]) =>
    line.target === 'VARIANT' && line.variant
      ? [line.variant.product.nameAr, line.variant.color?.nameAr, line.variant.size?.code]
          .filter(Boolean)
          .join(' · ')
      : (line.supply?.nameAr ?? line.description ?? '—');

  const receivable: ReceivableLine[] = order.lines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    label: label(l),
    ordered: formatQty(l.quantity),
    received: formatQty(l.receivedQty),
    outstanding: outstanding(l.quantity, l.receivedQty).toString(),
    unit: l.supply?.unit ?? null,
  }));

  return (
    <AppShell user={user} title={order.number}>
      <ModuleHeader
        title={order.number}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/purchasing" className="erp-btn-ghost">
              رجوع
            </Link>
            {canConfirm && status === 'DRAFT' && (
              <form action={changePurchaseStatus.bind(null, order.id, 'CONFIRMED')}>
                <button type="submit" className="erp-btn">
                  تأكيد الأمر
                </button>
              </form>
            )}
            {canConfirm && PURCHASE_TRANSITIONS[status].includes('CANCELLED') && (
              <form action={changePurchaseStatus.bind(null, order.id, 'CANCELLED')}>
                <button
                  type="submit"
                  className="rounded-lg border border-bad px-4 py-2 text-xs text-bad hover:bg-bad-soft"
                >
                  إلغاء
                </button>
              </form>
            )}
            {canWrite && (status === 'DRAFT' || status === 'CANCELLED') && (
              <form action={deletePurchaseOrder.bind(null, order.id)}>
                <button type="submit" className="erp-btn-ghost">
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      {errKey && ERRORS[errKey] && (
        <p role="alert" className="mb-5 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad">
          {ERRORS[errKey]}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-4 text-xs text-txt-3">
        <Badge tone={status === 'CANCELLED' ? 'bad' : status === 'RECEIVED' ? 'ok' : 'muted'}>
          {PURCHASE_STATUS_AR[status]}
        </Badge>
        <Link href={`/suppliers/${order.supplierId}`} className="text-brand underline">
          {order.supplier.name}
        </Link>
        <span className="tnum">{order.orderDate.toLocaleDateString('ar-EG')}</span>
        {order.expectedDate && (
          <span className="tnum">التوريد المتوقع: {order.expectedDate.toLocaleDateString('ar-EG')}</span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">البنود</h3>
            <Table
              headers={['#', 'الصنف', 'النوع', 'مطلوب', 'مستلم', 'متبقٍ', 'سعر الوحدة', 'الإجمالي']}
              empty={order.lines.length === 0}
            >
              {order.lines.map((line) => {
                const left = outstanding(line.quantity, line.receivedQty);
                return (
                  <tr key={line.id}>
                    <td className="tnum px-4 py-3 text-txt-4">{line.lineNo}</td>
                    <td className="px-4 py-3 text-txt">{label(line)}</td>
                    <td className="px-4 py-3 text-[0.7rem] text-txt-3">
                      {line.target === 'VARIANT' ? 'منتج جاهز' : 'مستلزمات'}
                    </td>
                    <td className="tnum px-4 py-3 text-txt-2">{formatQty(line.quantity)}</td>
                    <td className="tnum px-4 py-3 text-txt-2">{formatQty(line.receivedQty)}</td>
                    <td className={`tnum px-4 py-3 ${left.gt(0) ? 'text-warn' : 'text-ok'}`}>
                      {formatQty(left)}
                    </td>
                    <td className="tnum px-4 py-3 text-txt-3">{formatMoney(line.unitPrice)}</td>
                    <td className="tnum px-4 py-3 font-medium text-txt">
                      {formatMoney(line.lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </Table>

            <dl className="erp-card ms-auto mt-4 max-w-xs space-y-2 p-5 text-sm">
              <Row label="المجموع" value={formatMoney(order.subtotal)} />
              <Row label="الضريبة" value={formatMoney(order.taxAmount)} />
              <div className="border-t border-line pt-2">
                <Row label="الإجمالي" value={formatMoney(order.total)} strong />
              </div>
            </dl>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">الاستلامات</h3>
            {order.receipts.length === 0 ? (
              <p className="erp-card p-5 text-sm text-txt-3">
                لا توجد استلامات بعد. المخزون لا يرتفع قبل تسجيل استلام فعلي.
              </p>
            ) : (
              <Table headers={['الرقم', 'التاريخ', 'المخزن', 'البنود', 'استلمه', 'مرجع المورّد']} empty={false}>
                {order.receipts.map((r) => (
                  <tr key={r.id}>
                    <td dir="ltr" className="tnum px-4 py-3 text-start text-txt">
                      {r.number}
                    </td>
                    <td className="tnum px-4 py-3 text-txt-3">
                      {r.receiptDate.toLocaleDateString('ar-EG')}
                    </td>
                    <td className="px-4 py-3 text-txt-2">{r.warehouse.nameAr}</td>
                    <td className="tnum px-4 py-3 text-txt-3">{r.lines.length}</td>
                    <td className="px-4 py-3 text-txt-3">
                      {r.receivedBy ? (r.receivedBy.nameAr ?? r.receivedBy.name) : '—'}
                    </td>
                    <td className="px-4 py-3 text-txt-3">{r.reference ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {canReceive && open && (
            <section className="erp-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-brand">تسجيل استلام</h3>
              <ReceiveForm
                action={receiveGoods.bind(null, order.id)}
                lines={receivable}
                warehouses={warehouses.map((w) => ({ value: w.id, label: w.nameAr }))}
              />
            </section>
          )}

          {!open && status === 'DRAFT' && (
            <section className="erp-card p-5">
              <p className="text-[0.7rem] text-txt-4">
                الأمر مسودة. أكّده أولاً حتى يمكن تسجيل الاستلام — والتأكيد صلاحية
                منفصلة عن الاستلام عن قصد.
              </p>
            </section>
          )}

          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">المورّد</h3>
            <dl className="space-y-2 text-sm">
              <Row label="الاسم" value={order.supplier.name} />
              <Row label="الهاتف" value={order.supplier.phone} />
              <Row
                label="أنشأ الأمر"
                value={order.createdBy ? (order.createdBy.nameAr ?? order.createdBy.name) : '—'}
              />
            </dl>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? 'font-medium text-txt' : 'text-txt-3'}>{label}</dt>
      <dd className={`tnum ${strong ? 'font-semibold text-brand' : 'text-txt-2'}`}>{value}</dd>
    </div>
  );
}
