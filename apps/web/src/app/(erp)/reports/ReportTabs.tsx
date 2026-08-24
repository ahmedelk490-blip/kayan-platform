'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * شريط تبويبات التقارير — أعلى كل تقرير، للتنقّل بينها بشكل تبويبات (زي
 * النظام المرجعي) بدل العودة لفهرس التقارير. التبويب النشط مُبرَز، والشريط
 * يتمرّر أفقياً على الشاشات الضيّقة.
 */
const TABS: { href: string; label: string }[] = [
  { href: '/reports/financial', label: 'ملخص مالي' },
  { href: '/reports/statement', label: 'البيان المالي' },
  { href: '/reports/clients', label: 'تحليل العملاء' },
  { href: '/reports/client', label: 'تقرير عميل' },
  { href: '/reports/profitability', label: 'تحليل المنتجات' },
  { href: '/reports/aging', label: 'تقدّم الديون' },
  { href: '/reports/comparison', label: 'مقارنة الفترة' },
  { href: '/reports/cashflow', label: 'التدفق النقدي' },
  { href: '/reports/employees', label: 'تحليل الموظفين' },
  { href: '/reports/sales', label: 'المبيعات' },
  { href: '/reports/inventory', label: 'تقييم المخزون' },
  { href: '/reports/production', label: 'الإنتاجية' },
];

export function ReportTabs() {
  const path = usePathname();
  return (
    <div className="mb-5 overflow-x-auto border-b border-line">
      <nav className="-mb-px flex gap-1" aria-label="تبويبات التقارير">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
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
  );
}
