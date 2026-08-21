import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setCurrentTenant } from '@/lib/tenant-context';

/**
 * يقدّم بايتات صورة منتج رُفعت من النظام.
 *
 * الصور القديمة ملفات ثابتة على القرص تُقدَّم مباشرة؛ هذا المسار للصور
 * المرفوعة التي تعيش بايتاتها في القاعدة (data)، فتنجو من النشر. عام بلا
 * حدّ صلاحية — صورة منتج تُعرض على صفحة عامة — ومحصور في مستأجر الموقع.
 */
export const dynamic = 'force-dynamic';

const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  setCurrentTenant(PUBLIC_TENANT);

  try {
    const image = await prisma.productImage.findFirst({
      where: { id, product: { tenantId: PUBLIC_TENANT } },
      select: { data: true, mimeType: true },
    });

    if (!image?.data) {
      return new Response('لا توجد صورة بهذا المعرّف.', { status: 404 });
    }

    const body = new Uint8Array(image.data);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(body.byteLength),
        // المعرّف ثابت، والصورة تُستبدل بحذف وإضافة (معرّف جديد)، فالتخزين
        // الطويل آمن.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[product-img] تعذّر قراءة الصورة', error);
    return new Response('تعذّر قراءة الصورة.', { status: 500 });
  }
}
