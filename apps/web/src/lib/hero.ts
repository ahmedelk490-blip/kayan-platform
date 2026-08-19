import 'server-only';

import { prisma } from './prisma';
import { setCurrentTenant } from './tenant-context';

/**
 * شرائح واجهة الصفحة الرئيسية (Hero slider) — يتحكّم بها المدير من النظام.
 *
 * الصورة نفسها بايتات في القاعدة، لكن لا تُقرأ هنا: قراءة LONGBLOB لكل زائر
 * على الصفحة الرئيسية هدرٌ، والمكوّن لا يحتاج البايتات بل مساراً يطلبها منه
 * المتصفّح. فيُقرأ الوصف وحده، وتُقدَّم البايتات من `/hero/img/<id>` عند
 * الحاجة، مرة لكل صورة لا لكل طلب صفحة.
 *
 * ── لماذا يُعلَن المستأجر هنا ──────────────────────────────
 *
 * الصفحة العامة لا تمرّ بـ`requirePermission`، وهو الموضع الذي يحصر
 * الاستعلام في مستأجره. فيُعلَن هنا صراحةً كما في `catalog.ts`، ويبقى
 * الفلتر في الاستعلام نفسه هو الحاجز.
 */

/** المستأجر الذي يخدمه الموقع العام. */
const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

export interface PublicHeroSlide {
  id: string;
  title: string;
  subtitle: string;
  /** المسار الذي يقدّم بايتات الصورة. */
  src: string;
  width: number;
  height: number;
}

/**
 * الشرائح النشطة، مرتّبة.
 *
 * `isActive` فقط: شريحة يوقفها المدير تختفي من الواجهة فوراً وتبقى محفوظة،
 * كإيقاف منتج لا حذفه.
 *
 * يمسك الخطأ ويعيد قائمة فارغة كـ`publicProducts`: تعذّر قراءة الشرائح لا
 * يُسقط الصفحة الرئيسية — تعود إلى شرائح المنتجات، وهو ما تفعله الصفحة حين
 * لا شريحة مرفوعة أصلاً.
 */
export async function publicHeroSlides(): Promise<PublicHeroSlide[]> {
  setCurrentTenant(PUBLIC_TENANT);

  try {
    const rows = await prisma.heroSlide.findMany({
      where: { tenantId: PUBLIC_TENANT, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      // البايتات عمداً خارج التحديد: تُقرأ في المسار لا هنا.
      select: {
        id: true,
        title: true,
        subtitle: true,
        width: true,
        height: true,
        updatedAt: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      // v=updatedAt يكسر ذاكرة المتصفّح حين يستبدل المدير الصورة تحت نفس
      // المعرّف: مسار جديد فيُعاد جلبه، بلا أن نمنع التخزين أصلاً.
      src: `/hero/img/${r.id}?v=${r.updatedAt.getTime()}`,
      width: r.width,
      height: r.height,
    }));
  } catch (error) {
    console.error('[hero] تعذّر قراءة شرائح الواجهة من قاعدة البيانات', error);
    return [];
  }
}
