import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Kpi, EmptyMetric, Panel } from '@/components/Kpi';

export const metadata: Metadata = { title: 'لوحة المدير' };

/**
 * لوحة المدير.
 *
 * Every tile here is either backed by a real query or explicitly marked as
 * having no source yet. Nothing is invented: a dashboard that shows plausible
 * numbers from nowhere is worse than one that shows none.
 */
export default async function ManagerDashboard() {
  const user = await requirePermission('dashboard.view');

  const [productCount, categoryCount, imageCount, userCount, recentAudits] = await Promise.all([
    prisma.product.count({ where: { tenantId: user.tenantId } }),
    prisma.category.count({ where: { tenantId: user.tenantId } }),
    prisma.productImage.count(),
    prisma.user.count({ where: { tenantId: user.tenantId } }),
    prisma.auditLog.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: { select: { nameAr: true, name: true } } },
    }),
  ]);

  return (
    <AppShell user={user} title="لوحة المدير">
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-xs text-neutral-500">بيانات فعلية</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="المنتجات" value={String(productCount)} unit="منتج" />
            <Kpi label="التصنيفات" value={String(categoryCount)} unit="تصنيف" />
            <Kpi label="صور المنتجات" value={String(imageCount)} unit="صورة" />
            <Kpi label="المستخدمون" value={String(userCount)} unit="مستخدم" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs text-neutral-500">
            في انتظار وحدات لم تُبنَ بعد
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <EmptyMetric label="الإيرادات" reason="وحدة المبيعات غير مبنية" />
            <EmptyMetric label="صافي الربح" reason="وحدة الحسابات غير مبنية" />
            <EmptyMetric label="المصروفات" reason="وحدة الحسابات غير مبنية" />
            <EmptyMetric label="أوامر الإنتاج" reason="وحدة التصنيع غير مبنية" />
            <EmptyMetric label="الطلبات" reason="وحدة المبيعات غير مبنية" />
            <EmptyMetric label="المخزون" reason="وحدة المخزون غير مبنية" />
            <EmptyMetric label="العملاء" reason="وحدة العملاء غير مبنية" />
            <EmptyMetric label="تحليلات الذكاء الاصطناعي" reason="طبقة الذكاء الاصطناعي غير مبنية" />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="آخر النشاطات">
            {recentAudits.length === 0 ? (
              <p className="text-sm text-neutral-500">لا يوجد نشاط مسجّل بعد.</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {recentAudits.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-neutral-300">{ACTION_AR[entry.action] ?? entry.action}</p>
                      <p className="text-[0.7rem] text-neutral-600">
                        {entry.user?.nameAr ?? entry.user?.name ?? 'النظام'}
                      </p>
                    </div>
                    <time className="tnum shrink-0 text-[0.7rem] text-neutral-600">
                      {entry.createdAt.toLocaleString('ar-EG', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="إجراءات سريعة">
            <div className="grid gap-2">
              <QuickAction href="/products" label="إدارة المنتجات" />
              <QuickAction href="/reports" label="التقارير" />
              <QuickAction href="/manufacturing" label="التصنيع والمعادلات" />
            </div>
            <p className="mt-4 text-[0.7rem] leading-relaxed text-neutral-600">
              الإشعارات وتحليلات الذكاء الاصطناعي تظهر هنا بعد بناء وحداتها.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-ink-800 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-accent hover:text-accent"
    >
      {label}
    </Link>
  );
}

const ACTION_AR: Record<string, string> = {
  'auth.login.success': 'تسجيل دخول ناجح',
  'auth.login.failed': 'محاولة دخول فاشلة',
  'products.import': 'استيراد منتجات',
};
