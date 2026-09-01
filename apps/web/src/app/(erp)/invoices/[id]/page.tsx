import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  can,
  userCan,
  dec,
  formatMoney,
  formatQty,
  balance,
  daysOverdue,
  isInvoiceStatus,
  INVOICE_STATUS_AR,
  INVOICE_TRANSITIONS,
  PAYMENT_METHOD_AR,
  type InvoiceStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import { CopyButton } from '@/components/crud/CopyButton';
import { dateInput } from '@/lib/ops';
import type { SearchParams } from '@/lib/query';
import { PaymentForm, VoidForm } from '../PaymentForm';
import { issueInvoice, voidInvoice, recordPayment, reversePayment } from '../actions';

export const metadata: Metadata = { title: 'الفاتورة' };

const ERRORS: Record<string, string> = {
  empty: 'لا تُصدر فاتورة بلا بنود — كانت ستحرق رقماً ضريبياً لتقول لا شيء.',
};

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('invoices.view');
  const { id } = await params;
  const sp = await searchParams;
  const errKey = Array.isArray(sp.err) ? sp.err[0] : sp.err;

  // من لا يملك «عرض فواتير كل الموظفين» لا يفتح إلا فاتورته — لا بالرابط أيضاً.
  const seeAll = userCan(user.role, user.overrides, 'invoices.viewAll');
  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false, ...(seeAll ? {} : { createdById: user.id }) },
    include: {
      customer: true,
      salesOrder: { select: { id: true, number: true } },
      issuedBy: { select: { nameAr: true, name: true } },
      lines: { orderBy: { lineNo: 'asc' } },
      payments: {
        orderBy: { createdAt: 'asc' },
        include: {
          recordedBy: { select: { nameAr: true, name: true } },
          reversedBy: { select: { id: true } },
        },
      },
    },
  });
  if (!invoice) notFound();

  const company = await prisma.company.findFirst({ where: { tenantId: user.tenantId } });

  const canIssue = can(user.role, 'invoices.issue');
  const canPay = can(user.role, 'payments.record');
  const canWrite = can(user.role, 'invoices.write');

  const status: InvoiceStatus = isInvoiceStatus(invoice.status) ? invoice.status : 'DRAFT';
  const left = balance(invoice.total, invoice.paidAmount);
  const late = daysOverdue(invoice.dueDate, left);

  // رابط واتساب بنص الفاتورة جاهزاً — زبون هذا السوق كل تعامله واتساب.
  // الرقم يُحوَّل للصيغة الدولية: ٠٧… العراقي يصير ‎964…؛ الفتح لا يُرسل
  // شيئاً بنفسه — يفتح المحادثة والنص جاهز والبائع يضغط إرسال بنفسه.
  const waUrl = (() => {
    const raw = invoice.customer.whatsapp ?? invoice.customer.phone;
    if (!raw) return null;
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = `964${digits.slice(1)}`;
    if (digits.length < 10) return null;
    const text = [
      `فاتورة ${invoice.number ?? 'مسودة'}`,
      ...invoice.lines.map(
        (l) => `• ${l.description} × ${formatQty(l.quantity)} = ${formatMoney(l.lineTotal)} د.ع`,
      ),
      `الإجمالي: ${formatMoney(invoice.total)} د.ع`,
      dec(invoice.paidAmount).gt(0) ? `المدفوع: ${formatMoney(invoice.paidAmount)} د.ع` : null,
      dec(left).gt(0) ? `المتبقي: ${formatMoney(left)} د.ع` : 'مدفوعة بالكامل ✅',
      'شكراً لتعاملكم معنا — كيان للزي الموحد',
    ]
      .filter(Boolean)
      .join('\n');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  })();

  return (
    <AppShell user={user} title={invoice.number ?? 'فاتورة مسودة'}>
      <ModuleHeader
        title={invoice.number ?? 'فاتورة مسودة'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {invoice.number && <CopyButton text={invoice.number} label="رقم الفاتورة" />}
            <Link href="/invoices" className="erp-btn-ghost">
              رجوع
            </Link>
            <Link href={`/invoices/${invoice.id}/print`} className="erp-btn-ghost">
              طباعة / PDF
            </Link>
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="erp-btn-ghost">
                واتساب للعميل
              </a>
            )}
            {canWrite && status !== 'VOID' && (
              <Link href={`/invoices/${invoice.id}/edit`} className="erp-btn-ghost">
                تعديل البنود
              </Link>
            )}
            {canIssue && status === 'DRAFT' && (
              <form action={issueInvoice.bind(null, invoice.id)}>
                <button type="submit" className="erp-btn">
                  إصدار الفاتورة
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
        <Badge tone={status === 'PAID' ? 'ok' : status === 'VOID' ? 'bad' : 'muted'}>
          {INVOICE_STATUS_AR[status]}
        </Badge>
        <Link href={`/customers/${invoice.customerId}`} className="text-brand underline">
          {invoice.customer.companyName ?? invoice.customer.contactName}
        </Link>
        {invoice.issueDate && (
          <span className="tnum">صدرت {invoice.issueDate.toLocaleDateString('ar-EG')}</span>
        )}
        {invoice.dueDate && (
          <span className={`tnum ${late > 0 ? 'text-bad' : ''}`}>
            تستحق {invoice.dueDate.toLocaleDateString('ar-EG')}
            {late > 0 && ` — متأخرة ${late} يوم`}
          </span>
        )}
        {invoice.salesOrder && (
          <Link href={`/sales/orders/${invoice.salesOrder.id}`} className="text-brand underline">
            من أمر البيع {invoice.salesOrder.number}
          </Link>
        )}
      </div>

      {status === 'VOID' && invoice.voidReason && (
        <p className="mb-6 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad">
          فاتورة ملغاة — {invoice.voidReason}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">البنود</h3>
            <Table
              headers={['#', 'الوصف', 'الكمية', 'سعر الوحدة', 'خصم', 'ضريبة', 'الإجمالي']}
              empty={invoice.lines.length === 0}
            >
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="tnum px-4 py-3 text-txt-4">{line.lineNo}</td>
                  <td className="px-4 py-3 text-txt">{line.description}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatQty(line.quantity)}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatMoney(line.unitPrice)}</td>
                  <td className="tnum px-4 py-3 text-txt-3">{formatMoney(line.discountAmount)}</td>
                  <td className="tnum px-4 py-3 text-txt-3">{formatMoney(line.taxAmount)}</td>
                  <td className="tnum px-4 py-3 font-medium text-txt">
                    {formatMoney(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </Table>

            <dl className="erp-card ms-auto mt-4 max-w-xs space-y-2 p-5 text-sm">
              <Row label="المجموع" value={formatMoney(invoice.subtotal)} />
              <Row label="الخصم" value={formatMoney(invoice.discountAmount)} />
              <Row label="الضريبة" value={formatMoney(invoice.taxAmount)} />
              <div className="border-t border-line pt-2">
                <Row label="الإجمالي" value={formatMoney(invoice.total)} strong />
              </div>
              <Row label="المدفوع" value={formatMoney(invoice.paidAmount)} />
              <div className="border-t border-line pt-2">
                <Row label="المتبقي" value={formatMoney(left)} strong />
              </div>
            </dl>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">الدفعات</h3>
            {invoice.payments.length === 0 ? (
              <p className="erp-card p-5 text-sm text-txt-3">لا توجد دفعات بعد.</p>
            ) : (
              <Table
                headers={['الرقم', 'التاريخ', 'المبلغ', 'الطريقة', 'المرجع', 'سجّلها', '']}
                empty={false}
              >
                {invoice.payments.map((p) => {
                  const isReversal = Boolean(p.reversesId);
                  const wasReversed = Boolean(p.reversedBy);
                  return (
                    <tr key={p.id} className={wasReversed ? 'opacity-60' : ''}>
                      <td dir="ltr" className="tnum px-4 py-3 text-start text-txt">
                        {p.number}
                      </td>
                      <td className="tnum px-4 py-3 text-txt-3">
                        {p.paidAt.toLocaleDateString('ar-EG')}
                      </td>
                      <td
                        className={`tnum px-4 py-3 font-medium ${
                          dec(p.amount).isNegative() ? 'text-bad' : 'text-ok'
                        }`}
                      >
                        {formatMoney(p.amount)}
                      </td>
                      <td className="px-4 py-3 text-txt-3">
                        {(PAYMENT_METHOD_AR as Record<string, string>)[p.method] ?? p.method}
                      </td>
                      <td className="px-4 py-3 text-txt-3">{p.reference ?? '—'}</td>
                      <td className="px-4 py-3 text-txt-3">
                        {p.recordedBy ? (p.recordedBy.nameAr ?? p.recordedBy.name) : '—'}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {canPay && !isReversal && !wasReversed && (
                          <form action={reversePayment.bind(null, invoice.id, p.id)}>
                            <button type="submit" className="text-[0.7rem] text-bad hover:underline">
                              عكس
                            </button>
                          </form>
                        )}
                        {wasReversed && <span className="text-[0.7rem] text-txt-4">معكوسة</span>}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <p className="mt-2 text-[0.7rem] text-txt-4">
              الدفعات سجل لا يُعدَّل. الخطأ يُصحَّح بدفعة عاكسة تشير إلى الأصلية — المال
              الذي تحرّك ثم رجع واقعة، لا غلطة تُمحى.
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          {canPay && (status === 'ISSUED' || status === 'PARTIALLY_PAID') && dec(left).gt(0) && (
            <section className="erp-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-brand">تسجيل دفعة</h3>
              <PaymentForm
                action={recordPayment.bind(null, invoice.id)}
                outstanding={left.toString()}
                today={dateInput(new Date())}
              />
            </section>
          )}

          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">بيانات الفاتورة</h3>
            <dl className="space-y-2 text-sm">
              <Row label="العملة" value={company?.currency ?? 'IQD'} />
              <Row
                label="الرقم الضريبي"
                value={company?.taxNumber ?? 'غير مُدخَل'}
              />
              <Row
                label="أصدرها"
                value={invoice.issuedBy ? (invoice.issuedBy.nameAr ?? invoice.issuedBy.name) : '—'}
              />
            </dl>
            {!company?.taxNumber && (
              <p className="mt-3 text-[0.7rem] text-warn">
                الرقم الضريبي للشركة غير مُدخَل. أدخِله في إعدادات الشركة قبل إصدار فواتير
                رسمية — لم أخترعه.
              </p>
            )}
          </section>

          {canIssue && INVOICE_TRANSITIONS[status].includes('VOID') && (
            <section className="erp-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-brand">إلغاء</h3>
              <VoidForm action={voidInvoice.bind(null, invoice.id)} />
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
