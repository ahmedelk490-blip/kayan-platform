import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, dec, formatMoney } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { waLink } from '@/lib/wa';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { CustomerForm } from '../CustomerForm';
import { updateCustomer, deleteCustomer } from '../actions';
import { duplicateInvoice } from '@/app/(erp)/invoices/actions';
import { ActivityForm } from './ActivityForm';

export const metadata: Metadata = { title: 'بيانات العميل' };

const TYPE_AR: Record<string, string> = {
  NOTE: 'ملاحظة',
  CALL: 'مكالمة',
  VISIT: 'زيارة',
  MEETING: 'اجتماع',
  WHATSAPP: 'واتساب',
  EMAIL: 'بريد',
  SYSTEM: 'النظام',
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('customers.read');
  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      activities: {
        orderBy: { occurredAt: 'desc' },
        take: 30,
        include: { user: { select: { nameAr: true, name: true } } },
      },
      attachments: true,
    },
  });

  if (!customer) notFound();

  const canWrite = can(user.role, 'customers.write');
  const canSell = can(user.role, 'invoices.write');
  const update = updateCustomer.bind(null, customer.id);
  const remove = deleteCustomer.bind(null, customer.id);

  // فواتير العميل المفتوحة (للدين وكشف الحساب) + آخر فاتورة (لتكرار الطلب).
  const [openInvoices, lastInvoice] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        customerId: customer.id,
        isDeleted: false,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      orderBy: { issueDate: 'asc' },
      select: { number: true, issueDate: true, total: true, paidAmount: true },
    }),
    prisma.invoice.findFirst({
      where: {
        tenantId: user.tenantId,
        customerId: customer.id,
        isDeleted: false,
        status: { notIn: ['VOID'] },
        lines: { some: {} },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true },
    }),
  ]);

  const owed = openInvoices.reduce(
    (s, i) => s.plus(dec(i.total).minus(dec(i.paidAmount))),
    dec(0),
  );

  // كشف حساب جاهز للواتساب: الفواتير المفتوحة والمتبقي الكلي — للمطالبة بضغطة.
  const statementUrl =
    openInvoices.length > 0
      ? waLink(
          customer.whatsapp ?? customer.phone,
          [
            `كشف حساب — ${customer.companyName ?? customer.contactName}`,
            ...openInvoices.map(
              (i) =>
                `• ${i.number ?? 'فاتورة'}${i.issueDate ? ` (${i.issueDate.toLocaleDateString('ar-EG')})` : ''} — المتبقي ${formatMoney(dec(i.total).minus(dec(i.paidAmount)))} د.ع`,
            ),
            `الإجمالي المتبقي: ${formatMoney(owed)} د.ع`,
            'شاكرين تعاونكم — كيان للزي الموحد',
          ].join('\n'),
        )
      : null;

  return (
    <AppShell user={user} title={customer.contactName}>
      <ModuleHeader
        title={customer.companyName ?? customer.contactName}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/customers" className="erp-btn-ghost">
              رجوع
            </Link>
            {canSell && lastInvoice && (
              <form action={duplicateInvoice.bind(null, lastInvoice.id)}>
                {/* مسوّدة جديدة بنفس أصناف آخر فاتورة — للطلب الموسمي المتكرر. */}
                <button type="submit" className="erp-btn-ghost" title={`ينسخ ${lastInvoice.number ?? 'آخر فاتورة'}`}>
                  كرر آخر طلب
                </button>
              </form>
            )}
            {statementUrl && (
              <a href={statementUrl} target="_blank" rel="noopener noreferrer" className="erp-btn-ghost">
                كشف حساب واتساب
              </a>
            )}
            {canWrite && (
              <form action={remove}>
                <button
                  type="submit"
                  className="rounded-lg border border-bad px-4 py-2 text-xs text-bad transition-colors hover:bg-bad-soft"
                >
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      <p className="mb-2 text-xs text-txt-3">
        الكود <span dir="ltr" className="tnum">{customer.code}</span> · أُنشئ{' '}
        {customer.createdAt.toLocaleDateString('ar-EG')}
      </p>

      {/* الدين المفتوح واضح فوق قبل أي شيء — أو سطر اطمئنان أخضر. */}
      {owed.gt(0) ? (
        <p className="mb-5 inline-block rounded-lg border border-warn bg-warn-soft px-3 py-2 text-xs font-semibold text-warn">
          ⚠ عليه <span className="tnum">{formatMoney(owed)}</span> د.ع من {openInvoices.length}{' '}
          {openInvoices.length === 1 ? 'فاتورة مفتوحة' : 'فواتير مفتوحة'}
        </p>
      ) : (
        <p className="mb-5 inline-block rounded-lg border border-ok bg-ok-soft px-3 py-2 text-xs font-medium text-ok">
          ✓ لا ديون مفتوحة على هذا العميل
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="erp-card p-6">
          <h3 className="mb-5 text-sm font-semibold text-brand">البيانات</h3>
          {canWrite ? (
            <CustomerForm action={update} values={customer} submitLabel="حفظ التعديلات" />
          ) : (
            <dl className="grid gap-3 text-sm">
              <Row label="اسم المسؤول" value={customer.contactName} />
              <Row label="الشركة" value={customer.companyName} />
              <Row label="الهاتف" value={customer.phone} ltr />
              <Row label="واتساب" value={customer.whatsapp} ltr />
              <Row label="البريد" value={customer.email} ltr />
              <Row label="العنوان" value={customer.address} />
              <Row label="ملاحظات" value={customer.notes} />
            </dl>
          )}
        </section>

        <div className="space-y-6">
          {canWrite && (
            <section className="erp-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">إضافة نشاط</h3>
              <ActivityForm customerId={customer.id} />
            </section>
          )}

          <section className="erp-card p-6">
            <h3 className="mb-4 text-sm font-semibold text-brand">الجدول الزمني</h3>
            {customer.activities.length === 0 ? (
              <p className="text-sm text-txt-3">لا توجد نشاطات مسجّلة.</p>
            ) : (
              <ul className="space-y-3">
                {customer.activities.map((a) => (
                  <li key={a.id} className="border-s-2 border-brand-line ps-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-txt">{a.title}</p>
                      <time className="tnum shrink-0 text-[0.7rem] text-txt-4">
                        {a.occurredAt.toLocaleDateString('ar-EG')}
                      </time>
                    </div>
                    <p className="mt-0.5 text-[0.7rem] text-txt-3">
                      {TYPE_AR[a.type] ?? a.type}
                      {a.user && ` · ${a.user.nameAr ?? a.user.name}`}
                    </p>
                    {a.body && <p className="mt-1.5 text-xs text-txt-2">{a.body}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="erp-card p-6">
            <h3 className="mb-2 text-sm font-semibold text-brand">المرفقات</h3>
            <p className="text-xs text-txt-3">
              {customer.attachments.length === 0
                ? 'لا توجد مرفقات. رفع الملفات غير مُفعّل بعد.'
                : `${customer.attachments.length} مرفق`}
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value, ltr }: { label: string; value?: string | null; ltr?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-line pb-2">
      <dt className="w-28 shrink-0 text-xs text-txt-3">{label}</dt>
      <dd dir={ltr ? 'ltr' : undefined} className={ltr ? 'text-start text-txt-2' : 'text-txt-2'}>
        {value || '—'}
      </dd>
    </div>
  );
}
