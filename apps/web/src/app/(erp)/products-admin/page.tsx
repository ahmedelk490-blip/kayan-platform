import type { Metadata } from 'next';
import Link from 'next/link';
import { can, dec, formatMoney } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { StatCard } from '@/components/dashboard/StatCard';
import { QuickActions, type QuickAction } from '@/components/dashboard/QuickActions';
import { IconProduct, IconCategory, IconBell, IconActivity } from '@/components/dashboard/Icons';
import { DonutChartInteractive } from '@/components/dashboard/DonutChartInteractive';
import { HBarChartInteractive } from '@/components/dashboard/HBarChartInteractive';

export const metadata: Metadata = { title: 'لوحة إدارة المنتجات' };

/**
 * لوحة إدارة المنتجات — بوابة تُقرأ بنظرة، بأسلوب لوحة المدير نفسه.
 *
 * كانت بطاقات نصية رمادية وقوائم؛ صارت: بلاطات ملوّنة تفتح كل شاشة، صف
 * أرقام واحد، ورسمان تفاعليان. لا سرد — كل التفاصيل خلف بلاطتها.
 */
export default async function ProductsAdminPage() {
  const user = await requirePermission('products.read');

  const [products, stock, variantCount, seriesCount] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      select: { status: true, category: { select: { nameAr: true } } },
    }),
    prisma.stock.findMany({
      where: { variant: { product: { tenantId: user.tenantId } } },
      select: {
        onHand: true,
        minStock: true,
        variant: { select: { cost: true, product: { select: { cost: true, category: { select: { nameAr: true } } } } } },
      },
    }),
    prisma.productVariant.count({ where: { isDeleted: false, product: { tenantId: user.tenantId, isDeleted: false } } }),
    prisma.productBundle.count({ where: { tenantId: user.tenantId } }),
  ]);

  const productCount = products.length;
  const activeCount = products.filter((p) => p.status === 'ACTIVE').length;

  // توزيع المنتجات حسب التصنيف — للدونات.
  const countByCat = new Map<string, number>();
  for (const p of products) {
    const cat = p.category?.nameAr ?? 'غير مصنّف';
    countByCat.set(cat, (countByCat.get(cat) ?? 0) + 1);
  }

  // قيمة المخزون حسب التصنيف + إجماليها + أصناف تحت الحدّ.
  const valueByCat = new Map<string, ReturnType<typeof dec>>();
  let inventoryValue = dec(0);
  let lowStock = 0;
  for (const s of stock) {
    const unit = s.variant.cost ?? s.variant.product.cost ?? null;
    if (unit !== null) {
      const v = dec(s.onHand).times(dec(unit));
      inventoryValue = inventoryValue.plus(v);
      const cat = s.variant.product.category?.nameAr ?? 'غير مصنّف';
      valueByCat.set(cat, (valueByCat.get(cat) ?? dec(0)).plus(v));
    }
    if (dec(s.minStock).gt(0) && dec(s.onHand).lte(dec(s.minStock))) lowStock += 1;
  }

  const donutPoints = [...countByCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));
  const valuePoints = [...valueByCat.entries()]
    .sort((a, b) => b[1].minus(a[1]).toNumber())
    .slice(0, 8)
    .map(([label, v]) => ({ label, value: v.toNumber(), display: formatMoney(v) }));

  const canWrite = can(user.role, 'products.write');
  const seeInventory = can(user.role, 'inventory.read');

  // كل شاشات القسم كبلاطات ملوّنة — بلون هوية كل فعل.
  const actions: QuickAction[] = [
    { href: '/catalog/products', label: 'المنتجات', description: 'قائمة، بحث، وتعديل بالدست', available: true, emoji: '👕', gradient: 'from-[#7d3349] to-[#5c2535]' },
    { href: '/catalog/products/new', label: 'منتج جديد', description: 'دستة وتكلفة وسعر', available: canWrite, emoji: '➕', gradient: 'from-emerald-500 to-teal-700' },
    { href: '/catalog/categories', label: 'التصنيفات', description: 'الأصناف وترتيبها', available: true, emoji: '🗂️', gradient: 'from-sky-500 to-blue-700' },
    { href: '/catalog/review', label: 'عرض الموقع', description: 'ما يراه الزبون وموافقته', available: true, emoji: '🌐', gradient: 'from-violet-500 to-purple-700' },
    { href: '/inventory', label: 'الجرد الكامل', description: 'بالدست والقطعة وقيمته', available: seeInventory, emoji: '📦', gradient: 'from-amber-500 to-orange-600' },
    { href: '/inventory?tab=reorder', label: 'النواقص', description: lowStock > 0 ? `${lowStock} صنف يحتاج طلباً` : 'كله فوق الحدّ', available: seeInventory, emoji: '⚠️', gradient: 'from-rose-500 to-red-700' },
  ];

  return (
    <AppShell user={user} title="لوحة إدارة المنتجات">
      <div className="space-y-6">
        <ModuleHeader
          title="لوحة إدارة المنتجات"
          action={canWrite ? <Link href="/catalog/products/new" className="erp-btn">+ منتج جديد</Link> : null}
        />

        <QuickActions actions={actions} />

        {/* الأرقام الأربعة — لا أكثر. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            index={0}
            label="المنتجات"
            value={productCount}
            unit="منتج"
            hint={`${activeCount} نشط · ${variantCount} متغيّر`}
            icon={<IconProduct />}
            tone="primary"
          />
          <StatCard
            index={1}
            label="السيريات المعرّفة"
            value={seriesCount}
            unit="سيريه"
            hint="توزيعات مقاسات جاهزة"
            icon={<IconActivity />}
            tone="neutral"
          />
          <StatCard
            index={2}
            label="أصناف تحت الحدّ"
            value={lowStock}
            unit="صنف"
            hint={lowStock > 0 ? 'افتح النواقص لطلبها' : 'كله فوق الحدّ'}
            icon={<IconBell />}
            tone={lowStock > 0 ? 'warning' : 'success'}
          />
          <StatCard
            index={3}
            label="قيمة المخزون بالتكلفة"
            value={formatMoney(inventoryValue)}
            icon={<IconCategory />}
            tone="success"
          />
        </div>

        {/* رسمان تفاعليان — بصريان، بلا سطور. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="erp-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-brand">توزيع المنتجات حسب التصنيف</h3>
            {donutPoints.length > 0 ? (
              <DonutChartInteractive points={donutPoints} />
            ) : (
              <p className="py-8 text-center text-xs text-txt-4">لا منتجات بعد.</p>
            )}
          </section>
          <section className="erp-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-brand">قيمة المخزون حسب التصنيف</h3>
            {valuePoints.length > 0 ? (
              <HBarChartInteractive points={valuePoints} />
            ) : (
              <p className="py-8 text-center text-xs text-txt-4">لا رصيد بتكلفة معروفة بعد.</p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
