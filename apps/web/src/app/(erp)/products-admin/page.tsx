import type { Metadata } from 'next';
import Link from 'next/link';
import { can, dec, formatMoney } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DonutChartInteractive } from '@/components/dashboard/DonutChartInteractive';
import { HBarChartInteractive } from '@/components/dashboard/HBarChartInteractive';

export const metadata: Metadata = { title: 'لوحة إدارة المنتجات' };

interface Shortcut { href: string; title: string; desc: string; show: boolean }

/**
 * لوحة إدارة المنتجات — قسمٌ مستقل يجمع كل ما يخصّ المنتجات والمخزون في مكان
 * واحد ومنظّم: أرقام سريعة، رسمان تفاعليّان (توزيع المنتجات وقيمة المخزون حسب
 * التصنيف)، ثم بطاقات شورت-كت مقسّمة لمجموعتين واضحتين. بوابة منظّمة تفتح على
 * الشاشات الفعلية، لا شاشة عمل بذاتها.
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

  const stats = [
    { label: 'إجمالي المنتجات', value: String(productCount), hint: `${activeCount} نشط`, tone: undefined as 'bad' | undefined },
    { label: 'المتغيّرات (لون×مقاس)', value: String(variantCount), hint: undefined, tone: undefined },
    { label: 'السيريات المعرّفة', value: String(seriesCount), hint: undefined, tone: undefined },
    { label: 'أصناف تحت الحدّ', value: String(lowStock), hint: lowStock > 0 ? 'تحتاج طلب' : 'كله فوق الحدّ', tone: lowStock > 0 ? ('bad' as const) : undefined },
    { label: 'قيمة المخزون بالتكلفة', value: formatMoney(inventoryValue), hint: undefined, tone: undefined },
  ];

  const productCards: Shortcut[] = [
    { href: '/catalog/products', title: 'المنتجات', desc: 'قائمة المنتجات، بحث وفلترة، وتعديل (مع الدست والأسعار).', show: true },
    { href: '/catalog/products/new', title: '+ منتج جديد', desc: 'أضِف منتجاً بنظام الدست، وحدّد قطع الدستة وتكلفتها وسعرها.', show: canWrite },
    { href: '/catalog/products', title: 'السيريات والأسعار', desc: 'توزيع مقاسات السيريه وسعر الدست — من داخل صفحة المنتج.', show: canWrite },
    { href: '/catalog/categories', title: 'التصنيفات والقوائم', desc: 'أصناف المنتجات وترتيبها.', show: true },
    { href: '/catalog/review', title: 'مراجعة عرض الموقع', desc: 'المنتجات المعروضة على الموقع والموافقة عليها.', show: true },
  ];
  const stockCards: Shortcut[] = [
    { href: '/inventory', title: 'الجرد الكامل', desc: 'جرد المخزن بالدست والقطعة، مع قيمة كل صنف.', show: seeInventory },
    { href: '/inventory', title: 'النواقص وإعادة الطلب', desc: 'الأصناف تحت الحدّ الأدنى وما يجب طلبه.', show: seeInventory },
    { href: '/inventory', title: 'تسجيل حركة مخزون', desc: 'إدخال/صرف بالدست + قطعة زيادة — يتحسب أوتوماتيك.', show: seeInventory && canWrite },
  ];

  return (
    <AppShell user={user} title="لوحة إدارة المنتجات">
      <ModuleHeader
        title="لوحة إدارة المنتجات"
        action={canWrite ? <Link href="/catalog/products/new" className="erp-btn">+ منتج جديد</Link> : null}
      />

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

      {/* رسمان تفاعليان */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
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

      {/* بطاقات مقسّمة لمجموعتين */}
      <CardGroup title="المنتجات" cards={productCards} />
      <CardGroup title="المخزون والجرد" cards={stockCards} />
    </AppShell>
  );
}

/** مجموعة بطاقات شورت-كت تحت عنوان — تنظّم الروابط بصرياً. */
function CardGroup({ title, cards }: { title: string; cards: Shortcut[] }) {
  const shown = cards.filter((c) => c.show);
  if (shown.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-xs font-semibold text-txt-3">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="group flex items-start justify-between gap-3 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-brand hover:bg-card-2"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-txt group-hover:text-brand">{c.title}</h3>
              <p className="mt-1 text-[0.7rem] leading-[1.8] text-txt-4">{c.desc}</p>
            </div>
            <svg className="mt-0.5 shrink-0 text-txt-4 transition-transform group-hover:-translate-x-1 group-hover:text-brand" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
        ))}
      </div>
    </section>
  );
}
