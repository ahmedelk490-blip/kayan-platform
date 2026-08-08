import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  can,
  QUOTATION_TRANSITIONS,
  QUOTATION_STATUS_AR,
  isQuotationStatus,
  type QuotationStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { DocumentForm } from '../../DocumentForm';
import { loadSalesOptions } from '../../options';
import { StatusBadge } from '../../StatusBadge';
import {
  updateQuotation,
  changeQuotationStatus,
  deleteQuotation,
  duplicateQuotation,
  convertToOrder,
} from '../actions';

export const metadata: Metadata = { title: 'عرض السعر' };

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('sales.documents');
  const { id } = await params;

  const quotation = await prisma.quotation.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      customer: true,
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
      salesOrders: { select: { id: true, number: true, status: true } },
    },
  });
  if (!quotation) notFound();

  const options = await loadSalesOptions(user.tenantId);
  const canWrite = can(user.role, 'sales.write');
  const status = isQuotationStatus(quotation.status)
    ? (quotation.status as QuotationStatus)
    : 'DRAFT';
  const nextStates = QUOTATION_TRANSITIONS[status];
  const editable = canWrite && status !== 'CONVERTED';

  const update = updateQuotation.bind(null, quotation.id);

  return (
    <AppShell user={user} title={quotation.number}>
      <ModuleHeader
        title={quotation.number}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/sales/quotations" className="erp-btn-ghost">
              رجوع
            </Link>
            {canWrite && (
              <form action={duplicateQuotation.bind(null, quotation.id)}>
                <button type="submit" className="erp-btn-ghost">
                  نسخ
                </button>
              </form>
            )}
            {canWrite && status === 'ACCEPTED' && (
              <form action={convertToOrder.bind(null, quotation.id)}>
                <button type="submit" className="erp-btn">
                  تحويل إلى أمر بيع
                </button>
              </form>
            )}
            {editable && (
              <form action={deleteQuotation.bind(null, quotation.id)}>
                <button
                  type="submit"
                  className="rounded-lg border border-bad px-4 py-2 text-xs text-bad hover:bg-bad-soft"
                >
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-txt-3">
        <StatusBadge status={quotation.status} kind="quotation" />
        <span>{quotation.customer.companyName ?? quotation.customer.contactName}</span>
        <span className="tnum">{quotation.issueDate.toLocaleDateString('ar-EG')}</span>
        {quotation.salesRep && <span>المندوب: {quotation.salesRep.nameAr ?? quotation.salesRep.name}</span>}
      </div>

      {canWrite && nextStates.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-txt-3">تغيير الحالة:</span>
          {nextStates.map((s) => (
            <form key={s} action={changeQuotationStatus.bind(null, quotation.id, s)}>
              <button type="submit" className="erp-btn-ghost">
                {QUOTATION_STATUS_AR[s]}
              </button>
            </form>
          ))}
        </div>
      )}

      {quotation.salesOrders.length > 0 && (
        <p className="mb-6 rounded-lg border border-brand-line bg-brand-soft px-4 py-3 text-xs text-brand">
          محوَّل إلى أمر بيع:{' '}
          {quotation.salesOrders.map((o) => (
            <Link key={o.id} href={`/sales/orders/${o.id}`} className="underline">
              {o.number}
            </Link>
          ))}
        </p>
      )}

      {editable ? (
        <div className="erp-card p-6">
          <DocumentForm
            action={update}
            customers={options.customers}
            variants={options.variants}
            labels={{ dateA: 'تاريخ الإصدار', dateB: 'تاريخ الانتهاء' }}
            submitLabel="حفظ التعديلات"
            values={{
              customerId: quotation.customerId,
              notes: quotation.notes,
              discountAmount: quotation.discountAmount,
              discountPercent: quotation.discountPercent,
              dateA: quotation.issueDate.toISOString().slice(0, 10),
              dateB: quotation.expiryDate?.toISOString().slice(0, 10),
              lines: quotation.lines.map((l) => ({
                variantId: l.variantId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountAmount: l.discountAmount,
                taxRate: l.taxRate,
                notes: l.notes ?? '',
              })),
            }}
          />
        </div>
      ) : (
        <ReadOnlyLines lines={quotation.lines} total={quotation.total} subtotal={quotation.subtotal} tax={quotation.taxAmount} discount={quotation.discountAmount} />
      )}
    </AppShell>
  );
}

function ReadOnlyLines({
  lines,
  subtotal,
  discount,
  tax,
  total,
}: {
  lines: {
    id: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    product: { nameAr: string };
    variant: { sku: string; color: { nameAr: string } | null; size: { code: string } | null };
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}) {
  return (
    <div className="space-y-4">
      <Table headers={['المنتج', 'الكمية', 'سعر الوحدة', 'الإجمالي']} empty={lines.length === 0}>
        {lines.map((l) => (
          <tr key={l.id}>
            <td className="px-4 py-3 text-txt">
              {l.product.nameAr}
              {l.variant.color && ` · ${l.variant.color.nameAr}`}
              {l.variant.size && ` · ${l.variant.size.code}`}
            </td>
            <td className="tnum px-4 py-3 text-txt-2">{l.quantity}</td>
            <td className="tnum px-4 py-3 text-txt-2">{l.unitPrice}</td>
            <td className="tnum px-4 py-3 font-medium text-txt">{l.lineTotal}</td>
          </tr>
        ))}
      </Table>

      <dl className="erp-card ms-auto max-w-xs space-y-2 p-5 text-sm">
        <Row label="المجموع" value={subtotal} />
        <Row label="الخصم" value={-discount} />
        <Row label="الضريبة" value={tax} />
        <div className="border-t border-line pt-2">
          <Row label="الإجمالي" value={total} strong />
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? 'font-medium text-txt' : 'text-txt-3'}>{label}</dt>
      <dd className={`tnum ${strong ? 'font-semibold text-brand' : 'text-txt-2'}`}>{value}</dd>
    </div>
  );
}
