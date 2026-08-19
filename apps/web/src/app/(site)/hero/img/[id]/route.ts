import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setCurrentTenant } from '@/lib/tenant-context';

/**
 * يقدّم بايتات صورة شريحة الواجهة.
 *
 * الصور بايتات في القاعدة لتنجو من النشر (انظر HeroSlide في المخطّط). هذا
 * المسار العام يقرأ البايتات ويردّها بنوعها الصحيح. لا حدود صلاحية عليه —
 * الصورة تُعرض على صفحة عامة — لكنه محصور في مستأجر الموقع.
 *
 * يخدم الشريحة بمعرّفها بلا شرط isActive: شاشة التحكّم في النظام تعاين
 * الشرائح المعطّلة أيضاً، والصفحة الرئيسية لا تطلب إلا النشطة أصلاً.
 */
export const dynamic = 'force-dynamic';

const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  setCurrentTenant(PUBLIC_TENANT);

  try {
    const slide = await prisma.heroSlide.findFirst({
      where: { id, tenantId: PUBLIC_TENANT },
      select: { image: true, mimeType: true, updatedAt: true },
    });

    if (!slide) {
      return new Response('لا توجد صورة بهذا المعرّف.', { status: 404 });
    }

    // البايتات تصل من Prisma كـ Uint8Array. تُلفّ في Response مباشرة.
    const body = new Uint8Array(slide.image);

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': slide.mimeType,
        'Content-Length': String(body.byteLength),
        // المعرّف ثابت والبايتات قد تتغيّر تحته، فالرابط يحمل v=updatedAt
        // ويُخزَّن طويلاً بأمان: استبدال الصورة يغيّر الرابط لا محتواه.
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${slide.updatedAt.getTime()}"`,
      },
    });
  } catch (error) {
    console.error('[hero/img] تعذّر قراءة الصورة', error);
    return new Response('تعذّر قراءة الصورة.', { status: 500 });
  }
}
