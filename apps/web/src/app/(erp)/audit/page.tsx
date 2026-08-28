import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';

export const metadata: Metadata = { title: 'سجل التدقيق' };

/** ترجمة أفعال السجل الشائعة للعربية — وما لا يُعرف يُعرض كما هو. */
const ACTION_AR: Record<string, string> = {
  'invoice.create': 'إنشاء فاتورة',
  'invoice.issue': 'إصدار فاتورة',
  'invoice.void': 'إلغاء فاتورة',
  'invoice.editLines': 'تعديل بنود فاتورة',
  'payment.record': 'تسجيل دفعة',
  'payment.reverse': 'عكس دفعة',
  'cashier.sale': 'بيع كاشير',
  'return.create': 'تسجيل مرتجع',
  'return.delete': 'حذف مرتجع',
  'product.create': 'إنشاء منتج',
  'product.update': 'تعديل منتج',
  'product.softDelete': 'حذف منتج',
  'product.restore': 'استرجاع منتج',
  'bundle.create': 'إنشاء سيريه',
  'bundle.update': 'تعديل سيريه',
  'bundle.delete': 'حذف سيريه',
  'damage.create': 'محضر هالك',
  'damage.status': 'تغيير حالة هالك',
  'penalty.create': 'تسجيل جزاء',
  'stock.movement': 'حركة مخزون',
  'employee.payment': 'دفعة موظف',
  'product.image.upload': 'رفع صورة منتج',
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('settings.manage');
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? '';

  const where: Prisma.AuditLogWhereInput = {
    tenantId: user.tenantId,
    ...(q
      ? { OR: [{ action: { contains: q } }, { entityType: { contains: q } }, { detail: { contains: q } }] }
      : {}),
  };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { nameAr: true, name: true } } },
  });

  return (
    <AppShell user={user} title="سجل التدقيق">
      <ModuleHeader title="سجل التدقيق" count={rows.length} />

      <form className="mb-4" action="/audit">
        <input
          name="q"
          defaultValue={q}
          placeholder="ابحث بالإجراء أو النوع أو التفاصيل…"
          className="erp-input w-full max-w-md py-2.5"
        />
      </form>

      <Table headers={['الوقت', 'المستخدم', 'الإجراء', 'النوع', 'التفاصيل', 'IP']} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-card-2">
            <td className="tnum whitespace-nowrap px-4 py-2.5 text-txt-3">
              {r.createdAt.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
            </td>
            <td className="px-4 py-2.5 text-txt">{r.user?.nameAr ?? r.user?.name ?? 'النظام'}</td>
            <td className="px-4 py-2.5 text-txt-2">{ACTION_AR[r.action] ?? r.action}</td>
            <td className="px-4 py-2.5 text-txt-3">{r.entityType}</td>
            <td className="px-4 py-2.5 text-txt-3">{r.detail ?? '—'}</td>
            <td dir="ltr" className="tnum px-4 py-2.5 text-start text-txt-4">{r.ip ?? '—'}</td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
        آخر ٢٠٠ حدث. السجل للقراءة فقط — يوثّق من فعل ماذا ومتى، ولا يُعدَّل ولا يُحذف.
      </p>
    </AppShell>
  );
}
