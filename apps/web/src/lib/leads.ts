import 'server-only';

import { prisma } from './prisma';
import { setCurrentTenant } from './tenant-context';
import { nextCode } from './audit';

/**
 * استقبال طلب عرض سعر من الموقع العام.
 *
 * كان يُكتب في ملف JSONL بجوار التطبيق: غير مشفّر، خارج قاعدة البيانات،
 * ولا يراه أحد داخل النظام. كان على المدير أن يفتح ملفاً على الخادم ليعرف
 * أن عميلاً طلب عرضاً. الآن يصير سجلّ عميل حقيقي مع نشاطه، فيبدأ المسار:
 *
 *   زائر → عميل + نشاط → عرض سعر → أمر بيع → حجز → إنتاج → تسليم → فاتورة
 *
 * ── ما لا يفعله هذا الملف ──────────────────────────────────
 *
 * لا يُنشئ عرض سعر تلقائياً. عرض السعر مستند تجاري بأسعار وشروط، ولا أحد
 * يستطيع تسعير طلب لم يُقرأ بعد. الطلب يصل كعميل غير مؤهَّل ونشاط يصفه،
 * والمبيعات تفتح عرض السعر بعد المراجعة — وهي الخطوة التي يجب أن يقرّرها
 * إنسان.
 *
 * ── لماذا يُعلَن المستأجر هنا ──────────────────────────────
 *
 * هذا المسار الوحيد الذي يكتب بلا جلسة (03_System_Architecture §21.2)، فلا
 * يمرّ بـ`requirePermission` الذي يخبر قاعدة البيانات أي مستأجر تخدم.
 * الإعلان صريح ومحصور: إنشاء عميل غير مؤهَّل ونشاطه، ولا شيء غير ذلك.
 */

const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

export interface LeadInput {
  name: string;
  company: string;
  email: string;
  phone: string;
  interests: string[];
  message: string;
  receivedAt: string;
  source: string;
  client: string;
}

const INTEREST_AR: Record<string, string> = {
  printing: 'طباعة',
  embroidery: 'تطريز',
  uniforms: 'زي موحّد',
  safety: 'ملابس السلامة',
};

export async function createLead(lead: LeadInput): Promise<{ customerId: string; code: string }> {
  setCurrentTenant(PUBLIC_TENANT);

  // عميل موجود بنفس الرقم؟ لا يُنشأ ثانٍ. رقم الجوال هو ما يعرّف العميل
  // في هذا السوق، والتكرار يفرّق تاريخ العميل الواحد على سجلّين.
  const existing = await prisma.customer.findFirst({
    where: { tenantId: PUBLIC_TENANT, phone: lead.phone, isDeleted: false },
    select: { id: true, code: true },
  });

  const interests = lead.interests.map((i) => INTEREST_AR[i] ?? i).join(' · ');
  const body = [
    lead.message || null,
    interests ? `الاهتمام: ${interests}` : null,
    lead.email ? `البريد: ${lead.email}` : null,
    `المصدر: ${lead.source}`,
  ]
    .filter(Boolean)
    .join('\n');

  if (existing) {
    await prisma.customerActivity.create({
      data: {
        customerId: existing.id,
        type: 'INQUIRY',
        title: 'طلب عرض سعر من الموقع',
        body,
        occurredAt: new Date(lead.receivedAt),
      },
    });
    return { customerId: existing.id, code: existing.code };
  }

  const codes = await prisma.customer.findMany({
    where: { tenantId: PUBLIC_TENANT },
    select: { code: true },
  });

  const customer = await prisma.customer.create({
    data: {
      tenantId: PUBLIC_TENANT,
      code: await nextCode('CUS', codes),
      contactName: lead.name,
      companyName: lead.company || null,
      phone: lead.phone,
      // الواتساب يُملأ بنفس الرقم: هذا السوق يردّ على الواتساب، والمندوب
      // لا يجب أن يعيد كتابة الرقم ليتواصل.
      whatsapp: lead.phone,
      email: lead.email || null,
      notes: 'وصل من نموذج طلب عرض سعر في الموقع. غير مؤهَّل بعد.',
      activities: {
        create: {
          type: 'INQUIRY',
          title: 'طلب عرض سعر من الموقع',
          body,
          occurredAt: new Date(lead.receivedAt),
        },
      },
    },
    select: { id: true, code: true },
  });

  return { customerId: customer.id, code: customer.code };
}
