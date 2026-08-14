import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { REPORTS } from './Shell';

export const metadata: Metadata = { title: 'التقارير' };

export default async function ReportsPage() {
  const user = await requirePermission('reports.view');

  return (
    <AppShell user={user} title="التقارير">
      <ModuleHeader title="التقارير" />

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="erp-card p-6 transition-colors hover:border-brand"
          >
            <h3 className="text-base font-semibold text-brand">{report.title}</h3>
            <p className="mt-2 text-sm text-txt-3">{report.body}</p>
          </Link>
        ))}
      </div>

      <p className="mt-8 max-w-[70ch] text-[0.7rem] leading-[1.9] text-txt-4">
        كل رقم في هذه التقارير محسوب من السجلات نفسها لحظة العرض — لا جداول ملخّصات
        مخزّنة يمكن أن تتأخر عن الحقيقة. وحين لا توجد سجلات يقول التقرير ذلك صراحةً بدل
        أن يعرض صفراً يبدو كأنه قياس.
      </p>
    </AppShell>
  );
}
