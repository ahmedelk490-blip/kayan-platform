import type { Metadata } from 'next';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { WelcomeHeader } from '@/components/dashboard/WelcomeHeader';
import { StatCard, PendingCard } from '@/components/dashboard/StatCard';
import { SectionTitle, Panel } from '@/components/dashboard/Section';
import { RecentProducts, type RecentProduct } from '@/components/dashboard/RecentProducts';
import { QuickActions, type QuickAction } from '@/components/dashboard/QuickActions';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import {
  IconProduct,
  IconCategory,
  IconImage,
  IconUsers,
  IconShield,
  IconKey,
  IconClock,
  IconActivity,
  IconBell,
} from '@/components/dashboard/Icons';

export const metadata: Metadata = { title: 'لوحة المدير' };

/**
 * لوحة تحكم المدير.
 *
 * Two clearly separated bands:
 *   "بيانات فعلية"  — every figure is a live count
 *   "في انتظار…"    — modules that do not exist, shown as a dash
 *
 * No figure on this page is invented. Where a number would require a module
 * that has not been built, the card says so instead of guessing.
 */
export default async function ManagerDashboard() {
  const user = await requirePermission('dashboard.view');

  const [
    productCount,
    categoryCount,
    imageAgg,
    userCount,
    roleCount,
    permissionCount,
    activeSessions,
    auditCount,
    recentRows,
    recentAudits,
  ] = await Promise.all([
    prisma.product.count({ where: { tenantId: user.tenantId } }),
    prisma.category.count({ where: { tenantId: user.tenantId } }),
    prisma.productImage.aggregate({ _count: { _all: true }, _sum: { bytes: true } }),
    prisma.user.count({ where: { tenantId: user.tenantId } }),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.auditLog.count({ where: { tenantId: user.tenantId } }),
    prisma.product.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      // Four fills exactly one row at desktop width. Eight portrait cards
      // pushed the activity feed 1500px below the fold.
      take: 4,
      include: {
        category: { select: { nameAr: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        _count: { select: { images: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { user: { select: { nameAr: true, name: true } } },
    }),
  ]);

  const imageCount = imageAgg._count._all;
  const imageMb = (imageAgg._sum.bytes ?? 0) / 1024 / 1024;

  const recent: RecentProduct[] = recentRows.map((row) => ({
    id: row.id,
    sku: row.sku,
    nameAr: row.nameAr,
    categoryAr: row.category.nameAr,
    imagePath: row.images[0]?.path ?? null,
    imageCount: row._count.images,
  }));

  const actions: QuickAction[] = [
    { href: '/products', label: 'إدارة المنتجات', description: `${productCount} منتج · ${categoryCount} تصنيف`, available: true },
    { href: '/sales', label: 'لوحة المبيعات', description: 'عرض حالة المبيعات', available: true },
    { href: '/customers', label: 'العملاء', description: 'وحدة العملاء لم تُبنَ بعد', available: false },
    { href: '/manufacturing', label: 'التصنيع والمعادلات', description: 'وحدة التصنيع لم تُبنَ بعد', available: false },
  ];

  return (
    <AppShell user={user} title="لوحة المدير">
      <div className="space-y-7">
        <WelcomeHeader name={user.nameAr ?? user.name} roleAr={user.roleNameAr} />

        <section>
          <SectionTitle note="محسوبة مباشرة من قاعدة البيانات">بيانات فعلية</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label="المنتجات" value={productCount} unit="منتج" icon={<IconProduct />} tone="primary" />
            <StatCard index={1} label="التصنيفات" value={categoryCount} unit="تصنيف" icon={<IconCategory />} tone="primary" />
            <StatCard index={2} label="صور المنتجات" value={imageCount} unit="صورة" hint={`${imageMb.toFixed(1)} ميجابايت · WebP`} icon={<IconImage />} tone="success" />
            <StatCard index={3} label="المستخدمون" value={userCount} unit="مستخدم" icon={<IconUsers />} tone="neutral" />
            <StatCard index={4} label="الأدوار" value={roleCount} unit="دور" icon={<IconShield />} tone="neutral" />
            <StatCard index={5} label="الصلاحيات" value={permissionCount} unit="صلاحية" icon={<IconKey />} tone="neutral" />
            <StatCard index={6} label="الجلسات النشطة" value={activeSessions} unit="جلسة" icon={<IconClock />} tone="warning" />
            <StatCard index={7} label="سجل التدقيق" value={auditCount} unit="سجل" icon={<IconActivity />} tone="neutral" />
          </div>
        </section>

        <section>
          <SectionTitle note="لا تُعرض أرقام قبل بناء مصدرها" delay={0.2}>
            في انتظار تفعيل الموديول
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PendingCard index={0} label="الإيرادات" reason="تحتاج وحدة المبيعات" icon={<IconActivity />} />
            <PendingCard index={1} label="صافي الربح" reason="تحتاج وحدة الحسابات" icon={<IconActivity />} />
            <PendingCard index={2} label="المصروفات" reason="تحتاج وحدة الحسابات" icon={<IconActivity />} />
            <PendingCard index={3} label="أوامر الإنتاج" reason="تحتاج وحدة التصنيع" icon={<IconProduct />} />
            <PendingCard index={4} label="الطلبات" reason="تحتاج وحدة المبيعات" icon={<IconProduct />} />
            <PendingCard index={5} label="المخزون" reason="تحتاج وحدة المخزون" icon={<IconCategory />} />
            <PendingCard index={6} label="العملاء" reason="تحتاج وحدة العملاء" icon={<IconUsers />} />
            <PendingCard index={7} label="تحليلات الذكاء الاصطناعي" reason="تحتاج طبقة الذكاء الاصطناعي" icon={<IconBell />} />
          </div>
        </section>

        <section>
          <SectionTitle note={`${recent.length} من ${productCount}`} delay={0.3}>
            أحدث المنتجات
          </SectionTitle>
          <RecentProducts products={recent} />
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <Panel title="آخر النشاطات" delay={0.4}>
            <ActivityFeed
              items={recentAudits.map((entry) => ({
                id: entry.id,
                action: entry.action,
                actor: entry.user?.nameAr ?? entry.user?.name ?? 'النظام',
                at: entry.createdAt.toISOString(),
              }))}
            />
          </Panel>

          <div className="space-y-5">
            <Panel title="إجراءات سريعة" delay={0.45}>
              <QuickActions actions={actions} />
            </Panel>

            <Panel title="التنبيهات" delay={0.5}>
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-ink-800 p-4">
                <IconBell className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700" />
                <p className="text-xs leading-relaxed text-neutral-500">
                  لا توجد تنبيهات. وحدة الإشعارات ستُفعّل تنبيهات نقص المخزون وتأخر الإنتاج
                  وانتهاء الصلاحية بعد بنائها.
                </p>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
