import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import { rejectWebOrder } from './actions';

export const metadata: Metadata = { title: 'طلبات الموقع' };

const STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'muted' }> = {
  PENDING: { label: 'معلّق', tone: 'muted' },
  CONVERTED: { label: 'تحوّل لفاتورة', tone: 'ok' },
  REJECTED: { label: 'مرفوض', tone: 'bad' },
};

/**
 * طلبات المنتجات الواردة من الموقع.
 *
 * العميل اختار منتجاً بمقاسه ولونه وكميته. المندوب يراجع الطلب ويحوّله
 * لفاتورة (يُملأ نموذج الفاتورة تلقائياً بالعميل والصنف والكمية)، أو يرفضه.
 * الطلب لا يصير فاتورة بلا مراجعة إنسان — كالـleads تماماً.
 */
export default async function WebOrdersPage() {
  const user = await requirePermission('invoices.write');

  const orders = await prisma.webOrder.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: { lines: true },
  });

  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <AppShell user={user} title="طلبات الموقع">
      <ModuleHeader title="طلبات الموقع" count={pending} />

      <p className="mb-6 text-xs leading-[1.9] text-txt-3">
        طلبات المنتجات الواردة من الموقع العام. «تحويل لفاتورة» يفتح فاتورة جديدة
        مملوءة بالعميل والصنف والكمية — تختار الخدمة فيُحسب السعر، ثم تُصدرها. الطلب لا
        يصير فاتورة بلا مراجعتك.
      </p>

      <Table
        headers={['رقم الطلب', 'التاريخ', 'العميل', 'الجوال', 'الطلب', 'الحالة', '']}
        empty={orders.length === 0}
      >
        {orders.map((o) => {
          const status = STATUS[o.status] ?? STATUS.PENDING;
          const items = o.lines
            .map((l) => [l.productLabel, l.colorLabel, l.sizeLabel].filter(Boolean).join(' · ') + ` × ${l.quantity}`)
            .join('، ');
          return (
            <tr key={o.id} className="hover:bg-card-2">
              <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">{o.number}</td>
              <td className="px-4 py-3 text-txt-3">{fmt.format(o.createdAt)}</td>
              <td className="px-4 py-3 text-txt-2">
                {o.customerName}
                {o.company && <span className="block text-[0.7rem] text-txt-4">{o.company}</span>}
              </td>
              <td dir="ltr" className="px-4 py-3 text-start text-txt-3">{o.phone}</td>
              <td className="px-4 py-3 text-txt-2">
                {items}
                {o.note && <span className="mt-0.5 block text-[0.7rem] text-txt-4">{o.note}</span>}
              </td>
              <td className="px-4 py-3">
                <Badge tone={status.tone}>{status.label}</Badge>
              </td>
              <td className="px-4 py-3">
                {o.status === 'PENDING' ? (
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/invoices/new?webOrder=${o.id}`} className="text-xs font-medium text-brand hover:underline">
                      تحويل لفاتورة
                    </Link>
                    <form action={rejectWebOrder.bind(null, o.id)}>
                      <button type="submit" className="text-xs text-bad hover:underline">رفض</button>
                    </form>
                  </div>
                ) : o.status === 'CONVERTED' && o.invoiceId ? (
                  <Link href={`/invoices/${o.invoiceId}`} className="text-xs text-brand hover:underline">
                    الفاتورة
                  </Link>
                ) : (
                  <span className="text-[0.7rem] text-txt-4">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </AppShell>
  );
}
