import type { Metadata } from 'next';
import Link from 'next/link';
import { can, dec, formatMoney } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';

export const metadata: Metadata = { title: 'لوحة إدارة المنتجات' };

/**
 * لوحة إدارة المنتجات — قسمٌ مستقل يجمع كل ما يخصّ المنتجات والمخزون في مكان
 * واحد: أرقام سريعة أعلى الصفحة، وبطاقات شورت-كت لكل شاشة (إدخال المنتجات
 * والدست، الجرد الكامل، النواقص، تسجيل الحركة، السيريات، التصنيفات، مراجعة
 * الموقع). ليست شاشة عمل بذاتها بل بوابة منظّمة تفتح على الشاشات الفعلية.
 */
export default async function ProductsAdminPage() {
  const user = await requirePermission('products.read');

  const [productCount, activeCount, variantCount, seriesCount, stock] = await Promise.all([
    prisma.product.count({ where: { tenantId: user.tenantId, isDeleted: false } }),
    prisma.product.count({ where: { tenantId: user.tenantId, isDeleted: false, status: 'ACTIVE' } }),
    prisma.productVariant.count({ where: { isDeleted: false, product: { tenantId: user.tenantId, isDeleted: false } } }),
    prisma.productBundle.count({ where: { tenantId: user.tenantId } }),
    prisma.stock.findMany({
      where: { variant: { product: { tenantId: user.tenantId } } },
      select: { onHand: true, minStock: true, variant: { select: { cost: true, product: { select: { cost: true } } } } },
    }),
  ]);

  let inventoryValue = dec(0);
  let lowStock = 0;
  for (const s of stock) {
    const unit = s.variant.cost ?? s.variant.product.cost ?? null;
    if (unit !== null) inventoryValue = inventoryValue.plus(dec(s.onHand).times(dec(unit)));
    if (dec(s.minStock).gt(0) && dec(s.onHand).lte(dec(s.minStock))) lowStock += 1;
  }

  const canWrite = can(user.role, 'products.write');
  const seeInventory = can(user.role, 'inventory.read');

  const stats = [
    { label: 'إجمالي المنتجات', value: String(productCount), hint: `${activeCount} نشط` },
    { label: 'المتغيّرات (لون×مقاس)', value: String(variantCount) },
    { label: 'السيريات المعرّفة', value: String(seriesCount) },
    { label: 'أصناف تحت الحدّ', value: String(lowStock), tone: lowStock > 0 ? ('bad' as const) : undefined },
    { label: 'قيمة المخزون (بالتكلفة)', value: formatMoney(inventoryValue) },
  ];

  // البطاقات: كلٌّ تفتح شاشة فعلية. الترتيب من الأكثر استخداماً.
  const cards: { href: string; title: string; desc: string; show: boolean }[] = [
    { href: '/inventory/products', title: 'المنتجات', desc: 'قائمة المنتجات، بحث وفلترة، وتعديل (مع الدست والأسعار).', show: true },
    { href: '/catalog/products/new', title: '+ منتج جديد', desc: 'أضِف منتجاً بنظام الدست، وحدّد قطع الدستة وتكلفتها وسعرها.', show: canWrite },
    { href: '/inventory', title: 'الجرد الكامل', desc: 'جرد المخزن بالدست والقطعة، مع قيمة كل صنف.', show: seeInventory },
    { href: '/inventory', title: 'النواقص وإعادة الطلب', desc: 'الأصناف تحت الحدّ الأدنى وما يجب طلبه.', show: seeInventory },
    { href: '/inventory', title: 'تسجيل حركة مخزون', desc: 'إدخال/صرف بالدست + قطعة زيادة — يتحسب أوتوماتيك.', show: seeInventory && canWrite },
    { href: '/inventory/products', title: 'السيريات والأسعار', desc: 'توزيع مقاسات السيريه وسعر الدست — من داخل صفحة المنتج.', show: canWrite },
    { href: '/catalog/categories', title: 'التصنيفات والقوائم', desc: 'أصناف المنتجات وترتيبها.', show: true },
    { href: '/catalog/review', title: 'مراجعة عرض الموقع', desc: 'المنتجات المعروضة على الموقع العام والموافقة عليها.', show: true },
  ];

  return (
    <AppShell user={user} title="لوحة إدارة المنتجات">
      <ModuleHeader
        title="لوحة إدارة المنتجات"
        action={
          canWrite ? (
            <Link href="/catalog/products/new" className="erp-btn">+ منتج جديد</Link>
          ) : null
        }
      />

      <p className="mb-5 text-xs leading-[1.9] text-txt-4">
        كل ما يخصّ المنتجات والمخزون في مكان واحد. البطاقات تفتح الشاشات الفعلية.
      </p>

      {/* أرقام سريعة */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="erp-card p-4">
            <p className="text-[0.7rem] text-txt-3">{s.label}</p>
            <p className={`tnum mt-1 text-xl font-bold ${s.tone === 'bad' ? 'text-bad' : 'text-brand'}`}>{s.value}</p>
            {s.hint && <p className="mt-0.5 text-[0.7rem] text-txt-4">{s.hint}</p>}
          </div>
        ))}
      </div>

      {/* بطاقات الشورت-كت */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.filter((c) => c.show).map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="group flex items-start justify-between gap-3 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-brand"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-txt group-hover:text-brand">{c.title}</h3>
              <p className="mt-1 text-[0.7rem] leading-[1.8] text-txt-4">{c.desc}</p>
            </div>
            <svg className="mt-0.5 shrink-0 text-txt-4 group-hover:text-brand" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {/* سهم لليسار (RTL) */}
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
