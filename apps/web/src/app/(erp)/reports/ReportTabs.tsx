'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * تبويبات التقارير مقسّمةً أقساماً — بطلب المالك («تبسيط وتقسيم»).
 *
 * كانت أربعة عشر تبويباً في شريطٍ واحد يتمرّر أفقياً، ومنها «يومية اليوم»
 * و«الأرباح» مكرّرتان في شريط القسم أعلاه. الآن أربعة أقسام بأسمائها، وتحت
 * القسم المفتوح تقاريره وحدها — ثلاثة أو أربعة لا أربعة عشر.
 */
const GROUPS: { label: string; tabs: { href: string; label: string }[] }[] = [
  {
    label: 'المال',
    tabs: [
      { href: '/reports/financial', label: 'ملخص مالي' },
      { href: '/reports/statement', label: 'البيان المالي' },
      { href: '/reports/cashflow', label: 'التدفق النقدي' },
      { href: '/reports/comparison', label: 'مقارنة الفترة' },
    ],
  },
  {
    label: 'المبيعات والعملاء',
    tabs: [
      { href: '/reports/sales', label: 'المبيعات' },
      { href: '/reports/clients', label: 'تحليل العملاء' },
      { href: '/reports/client', label: 'تقرير عميل' },
      { href: '/reports/aging', label: 'تقدّم الديون' },
    ],
  },
  {
    label: 'المنتجات والمخزون',
    tabs: [
      { href: '/reports/profitability', label: 'تحليل المنتجات' },
      { href: '/reports/inventory', label: 'تقييم المخزون' },
      { href: '/reports/production', label: 'الإنتاجية' },
    ],
  },
  {
    label: 'الموظفون',
    tabs: [{ href: '/reports/employees', label: 'تحليل الموظفين' }],
  },
];

const isAt = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function ReportTabs() {
  const path = usePathname();
  const active = GROUPS.find((g) => g.tabs.some((t) => isAt(path, t.href))) ?? GROUPS[0];

  return (
    <div className="mb-5 space-y-2">
      {/* الأقسام */}
      <nav className="flex flex-wrap gap-2" aria-label="أقسام التقارير">
        {GROUPS.map((g) => (
          <Link
            key={g.label}
            href={g.tabs[0].href}
            aria-current={g === active ? 'true' : undefined}
            className={g === active ? 'erp-pill-active' : 'erp-pill'}
          >
            {g.label}
          </Link>
        ))}
      </nav>

      {/* تقارير القسم المفتوح */}
      {active.tabs.length > 1 && (
        <div className="overflow-x-auto border-b border-line">
          <nav className="-mb-px flex gap-1" aria-label={`تقارير ${active.label}`}>
            {active.tabs.map((t) => {
              const on = isAt(path, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? 'page' : undefined}
                  className={
                    on
                      ? 'shrink-0 border-b-2 border-brand px-3.5 py-2.5 text-sm font-medium text-brand'
                      : 'shrink-0 border-b-2 border-transparent px-3.5 py-2.5 text-sm text-txt-3 transition-colors hover:text-brand'
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
