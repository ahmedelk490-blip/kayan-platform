import type { Metadata } from 'next';
import Link from 'next/link';
import { can, formatMoney, PURCHASE_STATUS_AR, type PurchaseStatus } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';

export const metadata: Metadata = { title: 'فواتير الشراء' };

/**
 * فواتير الشراء — عرض لأوامر الشراء (فواتير الموردين فعلياً) تحت المبيعات.
 *
 * لا نوع "فاتورة شراء" منفصل في النظام؛ أمر الشراء هو التزام الدفع للمورد.
 * هذه الشاشة عرضٌ فقط — الإنشاء والاستلام يبقيان في شاشة المشتريات، ومن هنا
 * رابط لتفاصيل كل أمر.
 */
export default async function PurchaseInvoicesPage() {
  const user = await requirePermission('purchasing.view');

  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { orderDate: 'desc' },
    take: 100,
    include: { supplier: { select: { name: true } } },
  });

  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' });
  const canWrite = can(user.role, 'purchasing.write');

  return (
    <AppShell user={user} title="فواتير الشراء">
      <ModuleHeader
        title="فواتير الشراء"
        count={orders.length}
        action={
          <div className="flex gap-2">
            {canWrite && (
              <Link href="/purchasing/new" className="erp-btn">
                فاتورة شراء جديدة
              </Link>
            )}
            <Link href="/purchasing" className="erp-btn-ghost">
              إدارة المشتريات
            </Link>
          </div>
        }
      />

      <p className="mb-4 text-xs text-txt-3">
        فواتير الموردين هي أوامر الشراء. الإنشاء والاستلام من شاشة المشتريات؛ هنا عرضٌ
        سريع مع رابط لتفاصيل كل فاتورة.
      </p>

      <Table headers={['رقم الفاتورة', 'المورد', 'التاريخ', 'الحالة', 'الإجمالي', '']} empty={orders.length === 0}>
        {orders.map((o) => (
          <tr key={o.id}>
            <td className="px-4 py-3 font-medium text-txt" dir="ltr">{o.number}</td>
            <td className="px-4 py-3 text-txt-2">{o.supplier.name}</td>
            <td className="px-4 py-3 text-txt-3">{fmt.format(o.orderDate)}</td>
            <td className="px-4 py-3">
              <Badge tone="muted">
                {PURCHASE_STATUS_AR[o.status as PurchaseStatus] ?? o.status}
              </Badge>
            </td>
            <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(o.total)}</td>
            <td className="px-4 py-3 text-end">
              <Link href={`/purchasing/${o.id}`} className="text-xs text-brand hover:underline">
                التفاصيل
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </AppShell>
  );
}
