import Link from 'next/link';

/**
 * تبويبا الموقع العام: ما يطلبه الزبائن، وما يراه الزبائن.
 *
 * بطلب المالك: إدارة منتجات الموقع (الصور والأسعار والمقاسات والألوان) بجانب
 * طلباته مباشرة، لا في قائمة الكتالوج البعيدة.
 */
const TABS = [
  { href: '/sales/web-orders', label: 'طلبات الموقع' },
  { href: '/sales/site-products', label: 'منتجات الموقع' },
] as const;

export function SiteTabs({ active }: { active: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="الموقع" className="mb-4 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? 'page' : undefined}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${
            t.href === active ? 'border-brand font-semibold text-brand' : 'border-transparent text-txt-3'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
