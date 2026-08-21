import { Logo } from '@erp/brand/logo';
import { can, type PermissionKey } from '@erp/domain';
import type { SessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/(erp)/login/actions';
import { SidebarNav, MobileNav } from '@/components/NavLinks';
import { AreaTabs } from '@/components/AreaTabs';

/**
 * ERP chrome — sidebar + header.
 *
 * The navigation is filtered by permission, so a user never sees a link they
 * cannot open. That is presentation only: every page still guards itself
 * server-side. Hiding a link is courtesy; the guard is the security.
 */

interface NavItem {
  href: string;
  label: string;
  permission: PermissionKey;
  /**
   * Whether the route actually exists. A link to an unbuilt module is a 404,
   * which is worse than no link — so unbuilt modules are listed separately
   * and greyed rather than being made to look ready.
   */
  built: boolean;
  /** عنوان المجموعة التي يظهر تحتها؛ فارغ يعني أعلى الشريط بلا عنوان. */
  group: string;
}

/**
 * التنقّل مجمّعاً بدل قائمة مسطّحة طويلة.
 *
 * كانت ثلاثة وعشرين رابطاً في عمود واحد، لا يعرف المدير أين يبدأ. صارت
 * مجموعات قليلة معنونة: المبيعات معاً، المخزون والتصنيع معاً، وهكذا. لا
 * صفحة حُذفت — تغيّر ترتيبها وعنوانها فوق كلٍّ، فتُقرأ اللوحة بلمحة.
 *
 * «المخازن» أُزيل بطلب المالك: عناوين المخازن تفصيل لا يحتاجه، والمخزون
 * نفسه في شاشة المخزون.
 *
 * ترتيب المجموعات هو ترتيب ظهورها؛ عنصر بلا group يظهر أعلى بلا عنوان.
 */
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'لوحة المدير', permission: 'dashboard.view', built: true, group: '' },

  { href: '/sales', label: 'لوحة المبيعات', permission: 'sales.view', built: true, group: 'المبيعات' },
  { href: '/sales/quotations', label: 'عروض الأسعار', permission: 'sales.documents', built: true, group: 'المبيعات' },
  { href: '/sales/orders', label: 'أوامر البيع', permission: 'sales.documents', built: true, group: 'المبيعات' },
  { href: '/requests', label: 'طلبات الموقع', permission: 'customers.read', built: true, group: 'المبيعات' },
  { href: '/invoices', label: 'الفواتير والتحصيل', permission: 'invoices.view', built: true, group: 'المبيعات' },

  { href: '/inventory', label: 'المخزون', permission: 'inventory.read', built: true, group: 'المخزون والتصنيع' },
  { href: '/manufacturing', label: 'التصنيع', permission: 'manufacturing.view', built: true, group: 'المخزون والتصنيع' },
  { href: '/supplies', label: 'المستلزمات', permission: 'supplies.view', built: true, group: 'المخزون والتصنيع' },
  { href: '/formulas', label: 'المعادلات والتكلفة', permission: 'formula.view', built: true, group: 'المخزون والتصنيع' },
  { href: '/damage', label: 'الهالك والجزاءات', permission: 'damage.view', built: true, group: 'المخزون والتصنيع' },

  { href: '/purchasing', label: 'المشتريات', permission: 'purchasing.view', built: true, group: 'المشتريات' },
  { href: '/suppliers', label: 'الموردون', permission: 'suppliers.read', built: true, group: 'المشتريات' },
  { href: '/expenses', label: 'المصروفات الثانوية', permission: 'expenses.view', built: true, group: 'المشتريات' },

  { href: '/catalog/products', label: 'المنتجات', permission: 'products.read', built: true, group: 'المنتجات' },
  { href: '/catalog/categories', label: 'التصنيفات والقوائم', permission: 'products.read', built: true, group: 'المنتجات' },

  { href: '/customers', label: 'العملاء', permission: 'customers.read', built: true, group: 'العملاء' },
  { href: '/portal', label: 'بوابة العميل', permission: 'portal.view', built: true, group: 'العملاء' },

  { href: '/reports', label: 'التقارير', permission: 'reports.view', built: true, group: 'التقارير' },

  { href: '/users', label: 'حسابات الفريق', permission: 'users.manage', built: true, group: 'الإدارة' },
  { href: '/content', label: 'نصوص الموقع', permission: 'settings.manage', built: true, group: 'الإدارة' },
  { href: '/content/hero', label: 'صور الواجهة', permission: 'settings.manage', built: true, group: 'الإدارة' },
  { href: '/settings', label: 'الإعدادات المالية', permission: 'settings.manage', built: true, group: 'الإدارة' },
  { href: '/admin', label: 'إدارة النظام', permission: 'admin.view', built: true, group: 'الإدارة' },
];

/** ترتيب ظهور المجموعات في الشريط. */
const GROUP_ORDER = [
  '',
  'المبيعات',
  'المخزون والتصنيع',
  'المشتريات',
  'المنتجات',
  'العملاء',
  'التقارير',
  'الإدارة',
];

export function AppShell({
  user,
  title,
  children,
}: {
  user: SessionUser;
  title: string;
  children: React.ReactNode;
}) {
  const permitted = NAV.filter((item) => can(user.role, item.permission));
  const items = permitted.filter((item) => item.built);
  const pending = permitted.filter((item) => !item.built);

  // المجموعات بترتيبها، وكلٌّ بما يخصّه من روابط مسموحة. المجموعة الفارغة
  // من روابط (كل عناصرها ممنوعة عن هذا الدور) لا تُعرض.
  const groups = GROUP_ORDER.map((title) => ({
    title,
    links: items.filter((i) => i.group === title),
  })).filter((g) => g.links.length > 0);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-e border-line bg-card lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <Logo height={30} className="rounded-md" />
          <span className="text-sm text-txt">نظام كيان</span>
        </div>

        <nav className="space-y-5 p-3">
          {groups.map((g) => (
            <div key={g.title || 'top'}>
              {g.title && (
                <p className="mb-1.5 px-4 text-[0.68rem] font-semibold uppercase tracking-wide text-txt-4">
                  {g.title}
                </p>
              )}
              <SidebarNav items={g.links.map((i) => ({ href: i.href, label: i.label }))} />
            </div>
          ))}

          {pending.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <p className="px-4 text-[0.7rem] text-txt-4">وحدات لم تُبنَ بعد</p>
              <ul className="mt-2 space-y-1">
                {pending.map((item) => (
                  // Plain text, not a link — there is nothing to navigate to.
                  // The heading above already says these are not built.
                  <li key={item.href} className="px-4 py-2 text-sm text-txt-4">
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-card px-5 lg:px-8">
          <h1 className="truncate text-base font-semibold text-brand">{title}</h1>

          <div className="flex items-center gap-4">
            <div className="text-end">
              <p className="text-xs font-medium text-txt">{user.nameAr ?? user.name}</p>
              <p className="text-[0.7rem] text-txt-3">{user.roleNameAr}</p>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="erp-btn-ghost">
                خروج
              </button>
            </form>
          </div>
        </header>

        {/* التنقل على الموبايل — الشريط الجانبي مخفي تحت lg، وبدون هذا
            لا يستطيع مستخدم الهاتف الوصول لأي صفحة. */}
        <MobileNav items={items.map((i) => ({ href: i.href, label: i.label }))} />

        {/* تبويبات المنطقة الحالية — العروض والأوامر والفواتير تبويبات
            واحدة داخل المبيعات، وكذلك بقية المجموعات. */}
        <AreaTabs
          groups={groups.map((g) => ({
            title: g.title || 'الرئيسية',
            links: g.links.map((i) => ({ href: i.href, label: i.label })),
          }))}
        />

        <main className="min-w-0 flex-1 p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
