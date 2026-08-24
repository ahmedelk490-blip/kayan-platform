import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { DonutChartInteractive } from '@/components/dashboard/DonutChartInteractive';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'البيان المالي' };

/**
 * البيان المالي — قائمة دخل مبسّطة للفترة.
 *
 * المبيعات موزّعة على أصناف المنتجات (يلك، تيشيرت، مرايل…)، ناقص التكاليف
 * التشغيلية (الرواتب، الأكل)، والهالك، والصرفيات الثانوية — لبلوغ الربح
 * الصافي. كل رقم محسوب من السجلات لحظة العرض، بالدينار العراقي.
 */
export default async function StatementReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const range = resolveRange(params);
  const { from, to } = range;

  const [lines, salaries, expenses, damages] = await Promise.all([
    // بنود الفواتير الصادرة في الفترة، مع صنف منتجها — لتوزيع المبيعات.
    prisma.invoiceLine.findMany({
      where: {
        invoice: {
          tenantId: user.tenantId,
          isDeleted: false,
          status: { notIn: ['DRAFT', 'VOID'] },
          issueDate: { gte: from, lte: to },
        },
      },
      select: { lineTotal: true, product: { select: { category: { select: { nameAr: true } } } } },
    }),
    // الرواتب المدفوعة في الفترة.
    prisma.employeePayment.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, kind: 'SALARY', paidAt: { gte: from, lte: to } },
      select: { amount: true },
    }),
    // المصروفات المعتمدة في الفترة — نفصل الأكل عن باقي الصرفيات الثانوية.
    prisma.secondaryExpense.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: from, lte: to } },
      select: { amount: true, category: true },
    }),
    // الهالك المعتمد في الفترة.
    prisma.damageRecord.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', damageDate: { gte: from, lte: to } },
      select: { totalCost: true },
    }),
  ]);

  // المبيعات حسب الصنف.
  const byCategory = new Map<string, ReturnType<typeof dec>>();
  for (const l of lines) {
    const cat = l.product?.category?.nameAr ?? 'غير مصنّف';
    byCategory.set(cat, (byCategory.get(cat) ?? dec(0)).plus(dec(l.lineTotal)));
  }
  const salesRows = [...byCategory.entries()].sort((a, b) => b[1].minus(a[1]).toNumber());
  const totalSales = salesRows.reduce((s, [, v]) => s.plus(v), dec(0));

  const salaryTotal = salaries.reduce((s, p) => s.plus(dec(p.amount)), dec(0));
  const foodTotal = expenses
    .filter((e) => e.category === 'FOOD')
    .reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const secondaryTotal = expenses
    .filter((e) => e.category !== 'FOOD')
    .reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const damageTotal = damages.reduce((s, d) => s.plus(dec(d.totalCost)), dec(0));

  const totalCosts = salaryTotal.plus(foodTotal).plus(damageTotal).plus(secondaryTotal);
  const net = totalSales.minus(totalCosts);

  const donutPoints = salesRows.map(([cat, v]) => ({ label: cat, value: v.toNumber(), display: formatMoney(v) }));

  const empty = lines.length === 0 && totalCosts.eq(0);

  return (
    <AppShell user={user} title="البيان المالي">
      <ModuleHeader
        title="البيان المالي"
        action={
          <div className="flex gap-2">
            <a href={`/reports/statement/export?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">
              تصدير Excel
            </a>
            <Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/statement" period={range.period} from={range.fromStr} to={range.toStr} />

      {empty ? (
        <Empty what="حركة مالية" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <Figure label="إجمالي المبيعات" value={formatMoney(totalSales)} hint="بالدينار العراقي" strong />
            <Figure label="إجمالي التكاليف" value={formatMoney(totalCosts)} hint="رواتب + أكل + هالك + صرفيات" />
            <Figure
              label="الربح الصافي"
              value={formatMoney(net)}
              hint="المبيعات − كل التكاليف"
              strong
              tone={net.lt(0) ? 'bad' : undefined}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            {/* قائمة الدخل */}
            <section className="erp-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">قائمة الدخل</h3>

              <Group title="المبيعات">
                {salesRows.map(([cat, v]) => (
                  <Line key={cat} label={cat} value={formatMoney(v)} />
                ))}
                <Line label="إجمالي المبيعات" value={formatMoney(totalSales)} strong tone="ok" />
              </Group>

              <Group title="التكاليف التشغيلية">
                <Line label="الرواتب" value={formatMoney(salaryTotal)} />
                <Line label="الأكل" value={formatMoney(foodTotal)} />
              </Group>

              <Group title="أخرى">
                <Line label="الهالك والرواجع" value={formatMoney(damageTotal)} />
                <Line label="صرفيات ثانوية" value={formatMoney(secondaryTotal)} />
                <Line label="إجمالي التكاليف" value={formatMoney(totalCosts)} strong tone="bad" />
              </Group>

              <div className="mt-4 flex items-center justify-between border-t-2 border-brand/30 pt-4">
                <span className="text-sm font-semibold text-txt">الربح الصافي</span>
                <span className={`tnum text-xl font-bold ${net.lt(0) ? 'text-bad' : 'text-brand'}`}>
                  {formatMoney(net)}
                </span>
              </div>
            </section>

            {/* توزيع المبيعات */}
            <section className="erp-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">توزيع المبيعات حسب المنتج</h3>
              {donutPoints.length > 0 ? (
                <DonutChartInteractive points={donutPoints} />
              ) : (
                <p className="py-8 text-center text-sm text-txt-3">لا مبيعات في هذه الفترة.</p>
              )}
            </section>
          </div>

          <p className="mt-6 max-w-[70ch] text-[0.7rem] leading-[1.9] text-txt-4">
            المبيعات موزّعة على أصناف المنتجات من بنود الفواتير الصادرة. «الرواتب» هي دفعات
            الرواتب المسجّلة في قسم الرواتب، و«الأكل» بند مصروفات الطعام، و«الهالك» الهالك
            المعتمد، و«صرفيات ثانوية» باقي المصروفات المعتمدة عدا الطعام. الربح الصافي = المبيعات
            ناقص كل ذلك — وهو ربح تشغيلي مبسّط لا يخصم تكلفة البضاعة المباعة.
          </p>
        </>
      )}
    </AppShell>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[0.7rem] font-semibold text-txt-4">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-1.5 ${strong ? 'border-t border-line pt-2' : ''}`}>
      <span className={`text-sm ${strong ? 'font-semibold text-txt' : 'text-txt-2'}`}>{label}</span>
      <span
        className={`tnum text-sm ${strong ? 'font-bold' : 'font-medium'} ${
          tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-txt'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
