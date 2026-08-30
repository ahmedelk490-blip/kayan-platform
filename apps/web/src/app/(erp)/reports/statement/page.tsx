import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatMoney,
  formatQty,
  dec,
  EXPENSE_CATEGORY_AR,
  type ExpenseCategory,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { DonutChartInteractive } from '@/components/dashboard/DonutChartInteractive';
import { HBarChartInteractive } from '@/components/dashboard/HBarChartInteractive';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'البيان المالي' };

/**
 * البيان المالي الشامل — كل قرش دخل وخرج في بند معروف.
 *
 * المبيعات (وعدد القطع وأكثر المنتجات مبيعاً)، ناقص تكلفة البضاعة المباعة =
 * مجمل الربح؛ ثم ناقص الرواتب والمصروفات المفصّلة والهالك = الربح الصافي.
 * وقيمة المخزون الحالية بنداً مستقلاً. كل شيء بالفلتر وبالدينار العراقي.
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

  const [lines, salaries, expenses, damages, stock, returns] = await Promise.all([
    // بنود الفواتير الصادرة في الفترة — بالكمية والقيمة وتكلفة المنتج والصنف.
    prisma.invoiceLine.findMany({
      where: {
        invoice: {
          tenantId: user.tenantId,
          isDeleted: false,
          status: { notIn: ['DRAFT', 'VOID'] },
          issueDate: { gte: from, lte: to },
        },
      },
      select: {
        quantity: true,
        lineTotal: true,
        product: { select: { nameAr: true, cost: true, category: { select: { nameAr: true } } } },
      },
    }),
    prisma.employeePayment.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, kind: 'SALARY', paidAt: { gte: from, lte: to } },
      select: { amount: true },
    }),
    prisma.secondaryExpense.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: from, lte: to } },
      select: { amount: true, category: true },
    }),
    prisma.damageRecord.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', damageDate: { gte: from, lte: to } },
      select: { totalCost: true },
    }),
    // قيمة المخزون الحالية — موقفٌ لحظيّ لا يتقيّد بالفترة.
    prisma.stock.findMany({
      where: { variant: { product: { tenantId: user.tenantId } } },
      select: { onHand: true, variant: { select: { cost: true, product: { select: { cost: true } } } } },
    }),
    // الرواجع (مرتجعات المبيعات) المسجّلة في الفترة.
    prisma.salesReturn.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, returnDate: { gte: from, lte: to } },
      select: { totalAmount: true },
    }),
  ]);

  // ── المبيعات: إجمالي، عدد القطع، تكلفة البضاعة، حسب الصنف، وأكثر المنتجات ──
  let totalSales = dec(0);
  let piecesSold = dec(0);
  let cogs = dec(0);
  const byCategory = new Map<string, { revenue: ReturnType<typeof dec>; qty: ReturnType<typeof dec> }>();
  const byProduct = new Map<string, { revenue: ReturnType<typeof dec>; qty: ReturnType<typeof dec> }>();
  for (const l of lines) {
    const rev = dec(l.lineTotal);
    const qty = dec(l.quantity);
    totalSales = totalSales.plus(rev);
    piecesSold = piecesSold.plus(qty);
    cogs = cogs.plus(qty.times(dec(l.product?.cost ?? 0)));
    const cat = l.product?.category?.nameAr ?? 'غير مصنّف';
    const c = byCategory.get(cat) ?? { revenue: dec(0), qty: dec(0) };
    byCategory.set(cat, { revenue: c.revenue.plus(rev), qty: c.qty.plus(qty) });
    const pname = l.product?.nameAr ?? 'غير معروف';
    const p = byProduct.get(pname) ?? { revenue: dec(0), qty: dec(0) };
    byProduct.set(pname, { revenue: p.revenue.plus(rev), qty: p.qty.plus(qty) });
  }
  const salesRows = [...byCategory.entries()].sort((a, b) => b[1].revenue.minus(a[1].revenue).toNumber());
  const returnsTotal = returns.reduce((s, r) => s.plus(dec(r.totalAmount)), dec(0));
  const topByRevenue = [...byProduct.entries()].sort((a, b) => b[1].revenue.minus(a[1].revenue).toNumber());
  const topByQty = [...byProduct.entries()].sort((a, b) => b[1].qty.minus(a[1].qty).toNumber());

  // ── التكاليف ──
  const salaryTotal = salaries.reduce((s, p) => s.plus(dec(p.amount)), dec(0));
  const damageTotal = damages.reduce((s, d) => s.plus(dec(d.totalCost)), dec(0));
  const expensesByCat = new Map<string, ReturnType<typeof dec>>();
  for (const e of expenses) {
    expensesByCat.set(e.category, (expensesByCat.get(e.category) ?? dec(0)).plus(dec(e.amount)));
  }
  const expenseRows = [...expensesByCat.entries()].sort((a, b) => b[1].minus(a[1]).toNumber());
  const expenseTotal = expenses.reduce((s, e) => s.plus(dec(e.amount)), dec(0));

  // قيمة المخزون الحالية = Σ الرصيد × تكلفة القطعة.
  const inventoryValue = stock.reduce((s, r) => {
    const unit = r.variant.cost ?? r.variant.product.cost ?? null;
    return unit === null ? s : s.plus(dec(r.onHand).times(dec(unit)));
  }, dec(0));

  const grossProfit = totalSales.minus(cogs);
  const totalOpex = salaryTotal.plus(expenseTotal).plus(damageTotal);
  // الربح الصافي = مجمل الربح − التكاليف التشغيلية − الرواجع.
  const net = grossProfit.minus(totalOpex).minus(returnsTotal);

  const donutPoints = salesRows.map(([cat, v]) => ({ label: cat, value: v.revenue.toNumber(), display: formatMoney(v.revenue) }));
  const topRevenuePoints = topByRevenue.slice(0, 8).map(([name, v]) => ({ label: name, value: v.revenue.toNumber(), display: formatMoney(v.revenue) }));

  const empty = lines.length === 0 && totalOpex.eq(0);

  return (
    <AppShell user={user} title="البيان المالي">
      <ModuleHeader
        title="البيان المالي الشامل"
        action={
          <div className="flex gap-2">
            <a href={`/reports/statement/export?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">تصدير Excel</a>
            <Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/statement" period={range.period} from={range.fromStr} to={range.toStr} />

      {empty ? (
        <Empty what="حركة مالية" />
      ) : (
        <>
          {/* المؤشّرات الكبيرة — كل بند معروف. */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="إجمالي المبيعات" value={formatMoney(totalSales)} hint={`${formatQty(piecesSold)} قطعة مباعة`} strong />
            <Figure label="تكلفة البضاعة المباعة" value={formatMoney(cogs)} hint="الكمية × تكلفة القطعة" />
            <Figure label="مجمل الربح" value={formatMoney(grossProfit)} hint="المبيعات − تكلفة البضاعة" tone={grossProfit.lt(0) ? 'bad' : undefined} />
            <Figure label="إجمالي المصروفات" value={formatMoney(totalOpex)} hint="رواتب + مصروفات + هالك" />
            <Figure label="الرواتب" value={formatMoney(salaryTotal)} />
            <Figure label="المصروفات" value={formatMoney(expenseTotal)} hint={`${expenseRows.length} بند`} />
            <Figure label="الهالك" value={formatMoney(damageTotal)} tone={damageTotal.gt(0) ? 'warn' : undefined} />
            <Figure label="الرواجع (المرتجعات)" value={formatMoney(returnsTotal)} tone={returnsTotal.gt(0) ? 'bad' : undefined} />
            <Figure label="قيمة المخزون الحالية" value={formatMoney(inventoryValue)} hint="بالتكلفة" />
          </div>

          <div className="mb-6 flex items-center justify-between rounded-2xl border-2 border-brand/30 bg-brand-soft/40 px-6 py-4">
            <span className="text-base font-semibold text-txt">الربح الصافي</span>
            <span className={`tnum text-2xl font-bold ${net.lt(0) ? 'text-bad' : 'text-brand'}`}>{formatMoney(net)}</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            {/* قائمة الدخل الكاملة */}
            <section className="erp-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">قائمة الدخل</h3>

              <Group title="المبيعات (حسب الصنف — القيمة والعدد)">
                {salesRows.map(([cat, v]) => (
                  <Line key={cat} label={`${cat} — ${formatQty(v.qty)} قطعة`} value={formatMoney(v.revenue)} />
                ))}
                <Line label={`إجمالي المبيعات — ${formatQty(piecesSold)} قطعة`} value={formatMoney(totalSales)} strong tone="ok" />
              </Group>

              <Group title="تكلفة البضاعة المباعة">
                <Line label="تكلفة البضاعة المباعة" value={formatMoney(cogs)} />
                <Line label="مجمل الربح" value={formatMoney(grossProfit)} strong />
              </Group>

              <Group title="المصروفات (مفصّلة)">
                <Line label="الرواتب" value={formatMoney(salaryTotal)} />
                {expenseRows.map(([cat, v]) => (
                  <Line key={cat} label={(EXPENSE_CATEGORY_AR as Record<string, string>)[cat] ?? cat} value={formatMoney(v)} />
                ))}
                <Line label="الهالك" value={formatMoney(damageTotal)} />
                <Line label="إجمالي المصروفات" value={formatMoney(totalOpex)} strong tone="bad" />
              </Group>

              <Group title="الرواجع (المرتجعات)">
                <Line label="قيمة المرتجعات" value={formatMoney(returnsTotal)} tone={returnsTotal.gt(0) ? 'bad' : undefined} />
              </Group>

              <div className="mt-4 flex items-center justify-between border-t-2 border-brand/30 pt-4">
                <span className="text-sm font-semibold text-txt">الربح الصافي</span>
                <span className={`tnum text-xl font-bold ${net.lt(0) ? 'text-bad' : 'text-brand'}`}>{formatMoney(net)}</span>
              </div>
            </section>

            <div className="space-y-6">
              <section className="erp-card p-6">
                <h3 className="mb-4 text-sm font-semibold text-brand">أكثر المنتجات مبيعاً (بالقيمة)</h3>
                {topRevenuePoints.length > 0 ? <HBarChartInteractive points={topRevenuePoints} /> : <p className="py-6 text-center text-sm text-txt-3">لا مبيعات.</p>}
              </section>
              <section className="erp-card p-6">
                <h3 className="mb-4 text-sm font-semibold text-brand">توزيع المبيعات حسب الصنف</h3>
                {donutPoints.length > 0 ? <DonutChartInteractive points={donutPoints} /> : <p className="py-6 text-center text-sm text-txt-3">لا مبيعات.</p>}
              </section>
            </div>
          </div>

          {/* جدول أكثر المنتجات مبيعاً — بالعدد والقيمة معاً. */}
          <section className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-brand">المنتجات الأكثر طلباً</h3>
            <Table headers={['المنتج', 'العدد المباع', 'الإيراد']} empty={topByQty.length === 0}>
              {topByQty.slice(0, 15).map(([name, v]) => (
                <tr key={name} className="hover:bg-card-2">
                  <td className="px-4 py-2.5 text-txt">{name}</td>
                  <td className="tnum px-4 py-2.5 font-medium text-txt-2">{formatQty(v.qty)}</td>
                  <td className="tnum px-4 py-2.5 font-medium text-brand">{formatMoney(v.revenue)}</td>
                </tr>
              ))}
            </Table>
          </section>

          <p className="mt-6 max-w-[75ch] text-[0.7rem] leading-[1.9] text-txt-4">
            كل رقم محسوب من السجلات لحظة العرض بالفلتر المختار. المبيعات وعددها من بنود الفواتير
            الصادرة؛ تكلفة البضاعة = الكمية × تكلفة قطعة المنتج؛ الرواتب من قسم الرواتب؛ المصروفات
            هي المعتمدة مفصّلة ببنودها؛ الهالك المعتمد؛ وقيمة المخزون موقفٌ لحظيّ بالتكلفة (لا يُخصم
            من الربح). الرواجع من مرتجعات المبيعات في الفترة. الربح الصافي = المبيعات − تكلفة البضاعة
            − الرواتب − المصروفات − الهالك − الرواجع.
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

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'ok' | 'bad' }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-1.5 ${strong ? 'border-t border-line pt-2' : ''}`}>
      <span className={`text-sm ${strong ? 'font-semibold text-txt' : 'text-txt-2'}`}>{label}</span>
      <span className={`tnum text-sm ${strong ? 'font-bold' : 'font-medium'} ${tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-txt'}`}>{value}</span>
    </div>
  );
}
