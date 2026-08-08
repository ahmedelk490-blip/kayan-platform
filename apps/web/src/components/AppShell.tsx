import { Logo } from '@erp/brand/logo';
import { can, type PermissionKey } from '@erp/domain';
import type { SessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/login/actions';
import { SidebarNav, MobileNav } from '@/components/NavLinks';

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
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'لوحة المدير', permission: 'dashboard.view', built: true },
  { href: '/sales', label: 'المبيعات', permission: 'sales.view', built: true },
  { href: '/products', label: 'المنتجات', permission: 'products.read', built: true },
  { href: '/portal', label: 'بوابة العميل', permission: 'portal.view', built: true },
  { href: '/admin', label: 'الإدارة', permission: 'admin.view', built: true },
  { href: '/customers', label: 'العملاء', permission: 'customers.read', built: false },
  { href: '/inventory', label: 'المخزون', permission: 'inventory.read', built: false },
  { href: '/manufacturing', label: 'التصنيع', permission: 'manufacturing.read', built: false },
  { href: '/reports', label: 'التقارير', permission: 'reports.view', built: false },
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

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-e border-line bg-card lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <Logo height={30} className="rounded-md" />
          <span className="text-sm text-txt">نظام كيان</span>
        </div>

        <nav className="p-3">
          <SidebarNav items={items.map((i) => ({ href: i.href, label: i.label }))} />

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

        <main className="min-w-0 flex-1 p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
