import type { Metadata } from 'next';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Kpi, EmptyMetric, Panel } from '@/components/Kpi';

export const metadata: Metadata = { title: 'لوحة المبيعات' };

export default async function SalesDashboard() {
  const user = await requirePermission('sales.view');

  const productCount = await prisma.product.count({ where: { tenantId: user.tenantId } });

  return (
    <AppShell user={user} title="لوحة المبيعات">
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-xs text-neutral-500">بيانات فعلية</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="المنتجات المتاحة للبيع" value={String(productCount)} unit="منتج" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs text-neutral-500">في انتظار وحدات لم تُبنَ بعد</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <EmptyMetric label="مبيعات اليوم" reason="وحدة المبيعات غير مبنية" />
            <EmptyMetric label="هدف الشهر" reason="وحدة المبيعات غير مبنية" />
            <EmptyMetric label="عروض الأسعار" reason="وحدة عروض الأسعار غير مبنية" />
            <EmptyMetric label="الطلبات" reason="وحدة الطلبات غير مبنية" />
            <EmptyMetric label="الفواتير" reason="وحدة الحسابات غير مبنية" />
            <EmptyMetric label="المتابعات" reason="وحدة إدارة العملاء غير مبنية" />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="العملاء">
            <p className="text-sm text-neutral-500">
              وحدة العملاء لم تُبنَ بعد. الطلبات القادمة من الموقع تُحفظ حالياً في ملف مؤقت
              خارج قاعدة البيانات.
            </p>
          </Panel>

          <Panel title="المهام والتقويم">
            <p className="text-sm text-neutral-500">
              المهام والتقويم يظهران هنا بعد بناء وحدة إدارة العملاء.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
