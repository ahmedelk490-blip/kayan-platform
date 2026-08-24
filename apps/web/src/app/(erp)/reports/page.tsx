import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/guard';

/**
 * فهرس التقارير أُلغيت صفحته: الضغط على «التقارير» يفتح التقرير مباشرةً
 * (الملخص المالي) بشريط التبويبات في الأعلى للتنقّل بين بقيّة التقارير — بلا
 * صفحة كروت وسيطة. requirePermission يتكفّل بمن لا يملك صلاحية العرض.
 */
export default async function ReportsPage() {
  await requirePermission('reports.view');
  redirect('/reports/financial');
}
