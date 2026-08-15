import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';

/**
 * تصدير طلبات العملاء — CSV يفتحه Excel مباشرةً.
 *
 * ── لماذا CSV لا XLSX ──────────────────────────────────────
 *
 * XLSX يحتاج مكتبة تكتب ملفاً ثنائياً، وExcel يفتح CSV بلا وسيط. الأهم أن
 * الملف يبقى مقروءاً بأي أداة — دفتر ملاحظات، جداول Google، سكربت — بينما
 * الثنائي يحتاج نفس المكتبة لقراءته.
 *
 * ── BOM في أول الملف ──────────────────────────────────────
 *
 * Excel على ويندوز يقرأ CSV بترميز النظام لا UTF-8 ما لم يجد BOM، فتتحوّل
 * أسماء العملاء العربية إلى رموز. BOM ثلاثة بايتات تُنهي المشكلة، وهي فرق
 * بين ملف مفيد وملف يُرمى.
 *
 * ── الحماية ────────────────────────────────────────────────
 *
 * خلية تبدأ بـ`=` أو `+` أو `-` أو `@` يفسّرها Excel معادلة. اسم عميل أو
 * رسالة تبدأ بأحدها تصير أمراً ينفَّذ عند الفتح (CSV injection). تُسبق
 * بعلامة اقتباس مفردة فتُقرأ نصاً.
 */

/** يهرب الحقل ويمنع تفسيره كمعادلة. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requirePermission('customers.read');

  // المستأجر يُعلَن صراحةً. معالجات المسارات تعمل خارج شجرة عرض React،
  // فلا يصلها سياق الطلب — والاستعلام يخرج بلا مستأجر فترفضه RLS وتعود
  // بصفر صفوف بصمت. الصفحة تعرض العميل والتصدير لا يجده: نفس الاستعلام،
  // ونفس الجلسة، ونتيجتان. رُصد بالمقارنة بينهما.
  const rows = await withTenant(user.tenantId, (tx) =>
    tx.customerActivity.findMany({
    where: { type: 'INQUIRY', customer: { tenantId: user.tenantId, isDeleted: false } },
    orderBy: { occurredAt: 'desc' },
    include: {
      customer: {
        select: {
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
    }),
  );

  const headers = [
    'التاريخ',
    'كود العميل',
    'اسم العميل',
    'الشركة',
    'رقم الهاتف',
    'واتساب',
    'البريد',
    'تفاصيل الطلب',
    'المتابعة',
  ];

  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeStyle: 'short' });

  const lines = [
    headers.map(cell).join(','),
    ...rows.map((r) =>
      [
        fmt.format(r.occurredAt),
        r.customer.code,
        r.customer.contactName,
        r.customer.companyName ?? '',
        // نص صريح: الرقم يبدأ بـ+ وExcel يحوّله لرقم فيبتلع الصفر والعلامة.
        r.customer.phone,
        r.customer.whatsapp ?? '',
        r.customer.email ?? '',
        (r.body ?? '').replace(/\n/g, ' · '),
        r.customer._count.salesOrders > 0
          ? 'صار أمر بيع'
          : r.customer._count.quotations > 0
            ? 'عُرض عليه سعر'
            : 'لم يُتابَع',
      ]
        .map(cell)
        .join(','),
    ),
  ];

  const stamp = new Date().toISOString().slice(0, 10);

  // BOM بالهروب لا بحرف حرفي: الحرف غير مرئي ويُفقد بصمت عند مرور الملف
  // بأي أداة نسخ أو تنسيق، فيعود Excel لعرض العربية رموزاً.
  return new Response(String.fromCharCode(0xfeff) + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kayan-requests-${stamp}.csv"`,
      // بيانات عملاء: لا تُخزَّن في وسيط ولا في المتصفح.
      'Cache-Control': 'no-store',
    },
  });
}
