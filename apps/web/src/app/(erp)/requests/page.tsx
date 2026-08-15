import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';

export const metadata: Metadata = { title: 'طلبات العملاء' };

/**
 * طلبات العملاء الواردة من نموذج الموقع.
 *
 * كل طلب صار عميلاً حقيقياً في قاعدة البيانات مع نشاط من نوع INQUIRY. هذه
 * الشاشة تجمعها في مكان واحد بدل البحث عنها بين العملاء: المندوب يفتحها،
 * يقرأ ما طلبه العميل، ويحوّله إلى عرض سعر.
 *
 * لا حالة "مقروء/غير مقروء" مخزَّنة، لأن لا شيء يكتبها. الترتيب بالأحدث
 * يكفي، ووسم طلب بأنه مقروء بلا من يضغط زراً سيكون كذبة صغيرة تتراكم.
 */
export default async function RequestsPage() {
  const user = await requirePermission('customers.read');

  // النشاطات من نوع INQUIRY هي ما أنشأه نموذج الموقع. العميل يأتي معها،
  // فالمندوب يرى الاسم والرقم والطلب في سطر واحد.
  const inquiries = await prisma.customerActivity.findMany({
    where: { type: 'INQUIRY', customer: { tenantId: user.tenantId, isDeleted: false } },
    orderBy: { occurredAt: 'desc' },
    take: 200,
    include: {
      customer: {
        select: {
          id: true,
          code: true,
          contactName: true,
          companyName: true,
          phone: true,
          whatsapp: true,
          email: true,
          _count: { select: { quotations: true, salesOrders: true } },
        },
      },
    },
  });

  const fmt = new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <AppShell user={user} title="طلبات العملاء">
      <ModuleHeader
        title={`طلبات العملاء — ${inquiries.length}`}
        action={
          inquiries.length > 0 ? (
            // رابط عادي لا زر: التصدير تنزيل ملف، والمتصفح يتولّاه.
            <a href="/requests/export" className="erp-btn-ghost" download>
              تصدير Excel
            </a>
          ) : null
        }
      />

      <p className="mb-5 rounded-lg border border-line bg-card-2 px-4 py-3 text-xs leading-[1.9] text-txt-3">
        كل طلب هنا وصل من نموذج «اطلب عرض سعر» في الموقع، وصار عميلاً في النظام
        فور وصوله. حوّله إلى عرض سعر بعد قراءته — لا يُسعَّر طلب قبل أن يُقرأ.
      </p>

      <Table
        headers={['التاريخ', 'العميل', 'الهاتف', 'الطلب', 'الحالة', '']}
        empty={inquiries.length === 0}
      >
        {inquiries.map((a) => (
          <tr key={a.id}>
            <td className="whitespace-nowrap px-4 py-3 text-[0.75rem] text-txt-3">
              {fmt.format(a.occurredAt)}
            </td>
            <td className="px-4 py-3">
              <p className="text-txt">{a.customer.contactName}</p>
              {a.customer.companyName && (
                <p className="text-[0.7rem] text-txt-4">{a.customer.companyName}</p>
              )}
              <p className="text-[0.7rem] text-txt-4">{a.customer.code}</p>
            </td>
            <td className="px-4 py-3">
              {/* رقم الواتساب هو نفس الهاتف. الرابط بلا رسالة مسبقة: المندوب
                  يكتب ما يناسب الطلب، ولا نضع كلاماً على لسانه. */}
              <a
                dir="ltr"
                href={`https://wa.me/${a.customer.whatsapp?.replace(/[^\d]/g, '') ?? ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-start text-[0.75rem] text-brand hover:underline"
              >
                {a.customer.phone}
              </a>
              {a.customer.email && (
                <span dir="ltr" className="block text-start text-[0.7rem] text-txt-4">
                  {a.customer.email}
                </span>
              )}
            </td>
            <td className="max-w-[320px] px-4 py-3 text-[0.75rem] leading-[1.8] text-txt-3">
              {/* المتن يحمل الرسالة والاهتمامات والمصدر، سطراً لكل واحد. */}
              {(a.body ?? '').split('\n').map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </td>
            <td className="px-4 py-3">
              {a.customer._count.salesOrders > 0 ? (
                <Badge tone="ok">صار أمر بيع</Badge>
              ) : a.customer._count.quotations > 0 ? (
                <Badge tone="muted">عُرض عليه سعر</Badge>
              ) : (
                <Badge tone="bad">لم يُتابَع بعد</Badge>
              )}
            </td>
            <td className="px-4 py-3 text-end">
              <Link
                href={`/sales/quotations/new?customerId=${a.customer.id}`}
                className="text-[0.7rem] text-brand hover:underline"
              >
                عرض سعر
              </Link>
              <Link
                href={`/customers/${a.customer.id}`}
                className="ms-3 text-[0.7rem] text-txt-3 hover:underline"
              >
                الملف
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </AppShell>
  );
}
