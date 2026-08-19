import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { CreateSlideForm, SlideRow } from './HeroForms';
import { createSlide, updateSlideText, toggleSlide, moveSlide, deleteSlide } from './actions';

export const metadata: Metadata = { title: 'صور الواجهة (سلايدر)' };
export const dynamic = 'force-dynamic';

/**
 * التحكّم في شرائح واجهة الصفحة الرئيسية.
 *
 * المدير يرفع الصور ويرتّبها ويعطّلها من هنا، فتظهر على الموقع فوراً. حين
 * لا شريحة مرفوعة، تعرض الصفحة الرئيسية صور المنتجات كما كانت — الملاحظة
 * أدناه تقول ذلك صراحةً، فلا يظنّ المدير أن واجهته فارغة.
 *
 * البايتات لا تُقرأ هنا: الصفحة تعرض المسار الذي يقدّمها، صورةً لكل شريحة.
 */
export default async function HeroSlidesPage() {
  const user = await requirePermission('settings.manage');

  const rows = await prisma.heroSlide.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, subtitle: true, isActive: true, updatedAt: true },
  });

  const slides = rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    isActive: r.isActive,
    // v=updatedAt يكسر ذاكرة المتصفّح بعد استبدال الصورة تحت نفس المعرّف.
    src: `/hero/img/${r.id}?v=${r.updatedAt.getTime()}`,
  }));

  const activeCount = slides.filter((s) => s.isActive).length;

  return (
    <AppShell user={user} title="صور الواجهة (سلايدر)">
      <ModuleHeader
        title={`شرائح الواجهة — ${slides.length}`}
        action={
          <Link href="/content" className="erp-btn-ghost">
            نصوص الموقع
          </Link>
        }
      />

      <p className="mb-5 rounded-lg border border-line bg-card-2 px-4 py-3 text-xs leading-[1.9] text-txt-3">
        هذه صور السلايدر في أعلى الصفحة الرئيسية. ارفع صورك وسمّها ورتّبها —
        تظهر على <span dir="ltr">kayan-uniform.com</span> فوراً.
        {slides.length === 0 && (
          <>
            {' '}ما دام لا صورة هنا، يعرض الموقع صور منتجاتك تلقائياً، فلا تفرغ
            الواجهة. أول صورة ترفعها تحلّ محلّها.
          </>
        )}
        {slides.length > 0 && activeCount === 0 && (
          <>
            {' '}كل الشرائح معطّلة الآن، فالموقع يعرض صور المنتجات. فعّل واحدة على
            الأقل لتظهر صورك.
          </>
        )}
      </p>

      <section className="erp-card mb-6 p-6">
        <h3 className="mb-1 text-sm font-semibold text-brand">إضافة شريحة</h3>
        <p className="mb-4 text-[0.7rem] leading-[1.9] text-txt-4">
          الصورة تُصغَّر وتُحوَّل تلقائياً لصيغة خفيفة، وتُحفظ في قاعدة البيانات
          فتبقى بعد أي تحديث للنظام.
        </p>
        <CreateSlideForm action={createSlide} />
      </section>

      {slides.length > 0 && (
        <div className="space-y-3">
          {slides.map((slide, i) => (
            <SlideRow
              key={slide.id}
              slide={slide}
              isFirst={i === 0}
              isLast={i === slides.length - 1}
              updateText={updateSlideText.bind(null, slide.id)}
              toggle={toggleSlide.bind(null, slide.id, !slide.isActive)}
              move={moveSlide.bind(null, slide.id)}
              remove={deleteSlide.bind(null, slide.id)}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
