import { Logo } from '@erp/brand/logo';
import { can, type PermissionKey } from '@erp/domain';
import type { SessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/(erp)/login/actions';
import { MobileNav } from '@/components/NavLinks';
import { AreaTabs } from '@/components/AreaTabs';
import { GroupNav } from '@/components/GroupNav';

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
 * مجموعات قليلة معنونة: المبيعات معاً، المخزون معاً، وهكذا. لا
 * صفحة حُذفت — تغيّر ترتيبها وعنوانها فوق كلٍّ، فتُقرأ اللوحة بلمحة.
 *
 * «المخازن» أُزيل بطلب المالك: عناوين المخازن تفصيل لا يحتاجه، والمخزون
 * نفسه في شاشة المخزون.
 *
 * ترتيب المجموعات هو ترتيب ظهورها؛ عنصر بلا group يظهر أعلى بلا عنوان.
 */
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'لوحة المدير', permission: 'dashboard.view', built: true, group: '' },

  // المبيعات = فواتير المبيعات أولاً (هو المطلوب يومياً)، وتبويب واحد لفواتير
  // الشراء. عروض الأسعار وأوامر البيع وطلبات الموقع صارت أقساماً أسفل شاشة
  // الفواتير, لا تبويبات مستقلة — بطلب المالك.
  { href: '/sales', label: 'لوحة المبيعات', permission: 'sales.view', built: true, group: 'المبيعات' },
  { href: '/invoices', label: 'فواتير المبيعات', permission: 'invoices.view', built: true, group: 'المبيعات' },
  { href: '/sales/purchase-invoices', label: 'فواتير الشراء', permission: 'purchasing.view', built: true, group: 'المبيعات' },

  { href: '/inventory', label: 'المخزون', permission: 'inventory.read', built: true, group: 'المخزون' },
  { href: '/manufacturing', label: 'التصنيع', permission: 'manufacturing.view', built: true, group: 'المخزون' },
  { href: '/supplies', label: 'المستلزمات', permission: 'supplies.view', built: true, group: 'المخزون' },
  { href: '/formulas', label: 'المعادلات والتكلفة', permission: 'formula.view', built: true, group: 'المخزون' },
  { href: '/damage', label: 'الهالك والجزاءات', permission: 'damage.view', built: true, group: 'المخزون' },

  { href: '/purchasing', label: 'المشتريات', permission: 'purchasing.view', built: true, group: 'المشتريات' },
  { href: '/suppliers', label: 'الموردون', permission: 'suppliers.read', built: true, group: 'المشتريات' },
  { href: '/expenses', label: 'المصروفات الثانوية', permission: 'expenses.view', built: true, group: 'المشتريات' },

  { href: '/catalog/products', label: 'المنتجات', permission: 'products.read', built: true, group: 'المنتجات' },
  { href: '/catalog/categories', label: 'التصنيفات والقوائم', permission: 'products.read', built: true, group: 'المنتجات' },

  { href: '/customers', label: 'العملاء', permission: 'customers.read', built: true, group: 'العملاء' },
  { href: '/portal', label: 'بوابة العميل', permission: 'portal.view', built: true, group: 'العملاء' },

  { href: '/reports', label: 'التقارير', permission: 'reports.view', built: true, group: 'التقارير' },

  { href: '/users', label: 'حسابات الفريق', permission: 'users.manage', built: true, group: 'الإدارة' },
  { href: '/hr', label: 'الرواتب والموظفين', permission: 'users.manage', built: true, group: 'الإدارة' },
  { href: '/content', label: 'نصوص الموقع', permission: 'settings.manage', built: true, group: 'الإدارة' },
  { href: '/content/hero', label: 'صور الواجهة', permission: 'settings.manage', built: true, group: 'الإدارة' },
  { href: '/settings', label: 'الإعدادات المالية', permission: 'settings.manage', built: true, group: 'الإدارة' },
  { href: '/admin', label: 'إدارة النظام', permission: 'admin.view', built: true, group: 'الإدارة' },
];

/** ترتيب ظهور المجموعات في الشريط. */
const GROUP_ORDER = [
  '',
  'المبيعات',
  'المخزون',
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

  // آمن ضد الاسم الفارغ: لو الاسمان فارغان لا نستدعي split على null فيسقط
  // الشِّل كله (كل صفحات ERP). نرجع حرفاً بديلاً بدل الانهيار.
  const initials =
    (user.nameAr ?? user.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('') || '؟';

  return (
    <div className="flex min-h-screen">
      {/* الشريط عمودٌ كامل الارتفاع وثابت: القوائم أعلاه في منطقة قابلة
          للتمرير، وبطاقة المستخدم مثبّتة أسفله. بلا التثبيت السفلي كانت
          القوائم القليلة تترك فراغاً كبيراً تحتها يبدو كأن الشريط مقطوع. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-line bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-5">
          <Logo height={30} className="rounded-md" />
          <span className="text-sm text-txt">نظام كيان</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {/* عنصر واحد لكل مجموعة، يفتح لوحتها. التنقّل بين صفحات المجموعة
              من التبويبات أعلى المحتوى, لا من الشريط الجانبي. */}
          <GroupNav
            groups={groups.map((g) => ({
              title: g.title || g.links[0].label,
              primary: g.links[0].href,
              hrefs: g.links.map((i) => i.href),
            }))}
          />

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

        {/* بطاقة المستخدم مثبّتة أسفل الشريط — تملأ القاع فيبدو الشريط
            متكاملاً, والخروج في متناول اليد دون العودة للأعلى. */}
        <div className="shrink-0 border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-xl bg-card-2 px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-txt">{user.nameAr ?? user.name}</p>
              <p className="truncate text-[0.7rem] text-txt-3">{user.roleNameAr}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
                className="grid h-8 w-8 place-items-center rounded-lg text-txt-3 transition-colors hover:bg-card hover:text-brand"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-card px-5 lg:px-8">
          <h1 className="truncate text-base font-semibold text-brand">{title}</h1>

          {/* هوية المستخدم والخروج في الترويسة للموبايل والتابلت حيث يختفي
              الشريط الجانبي؛ على الديسكتوب تظهر في أسفل الشريط بدلاً منها. */}
          <div className="flex items-center gap-4 lg:hidden">
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

        {/* التنقل على الموبايل — عنصر لكل مجموعة، والتبويبات أسفله تتنقّل
            داخلها. الشريط الجانبي مخفي تحت lg. */}
        <MobileNav
          items={groups.map((g) => ({ href: g.links[0].href, label: g.title || g.links[0].label }))}
        />

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
