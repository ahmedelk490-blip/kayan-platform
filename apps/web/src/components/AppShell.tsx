import Link from 'next/link';
import { Logo } from '@erp/brand/logo';
import { can, type PermissionKey } from '@erp/domain';
import type { SessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/login/actions';

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
      <aside className="hidden w-60 shrink-0 border-e border-ink-800 bg-ink-900/40 lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-ink-800 px-5">
          <Logo height={30} className="rounded-md" />
          <span className="text-sm text-neutral-200">نظام كيان</span>
        </div>

        <nav className="p-3">
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-4 py-2.5 text-sm text-neutral-400 transition-colors hover:bg-ink-800 hover:text-neutral-100"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          {pending.length > 0 && (
            <div className="mt-6 border-t border-ink-800 pt-4">
              <p className="px-4 text-[0.7rem] text-neutral-600">وحدات لم تُبنَ بعد</p>
              <ul className="mt-2 space-y-1">
                {pending.map((item) => (
                  // Plain text, not a link — there is nothing to navigate to.
                  // The heading above already says these are not built.
                  <li key={item.href} className="px-4 py-2 text-sm text-neutral-700">
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-ink-800 px-5 lg:px-8">
          <h1 className="truncate text-base text-neutral-100">{title}</h1>

          <div className="flex items-center gap-4">
            <div className="text-end">
              <p className="text-xs text-neutral-200">{user.nameAr ?? user.name}</p>
              <p className="text-[0.7rem] text-neutral-500">{user.roleNameAr}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-accent hover:text-accent"
              >
                خروج
              </button>
            </form>
          </div>
        </header>

        {/* التنقل على الموبايل — الشريط الجانبي مخفي تحت lg، وبدون هذا
            لا يستطيع مستخدم الهاتف الوصول لأي صفحة. */}
        <nav
          aria-label="التنقل الرئيسي"
          className="flex gap-2 overflow-x-auto border-b border-ink-800 px-5 py-2.5 lg:hidden"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full border border-ink-700 px-3.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-accent hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
