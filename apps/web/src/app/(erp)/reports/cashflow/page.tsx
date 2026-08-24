import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, dec, monthlySeries } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { LineChartInteractive } from '@/components/dashboard/LineChartInteractive';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'التدفق النقدي' };

/**
 * التدفق النقدي — النقد الداخل (المدفوعات المحصَّلة) مقابل الخارج (المصروفات
 * المعتمدة) شهرياً، والرصيد التراكمي.
 */
export default async function CashflowReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const range = resolveRange(params);
  const { from, to } = range;

  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId: user.tenantId, paidAt: { gte: from, lte: to } },
      select: { amount: true, paidAt: true },
    }),
    prisma.secondaryExpense.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: from, lte: to } },
      select: { amount: true, expenseDate: true },
    }),
  ]);

  const inSeries = monthlySeries(payments.map((p) => ({ date: p.paidAt as Date, amount: p.amount })), from, to);
  const outSeries = monthlySeries(expenses.map((e) => ({ date: e.expenseDate as Date, amount: e.amount })), from, to);

  let running = dec(0);
  const months = inSeries.map((pt, i) => {
    const inn = dec(pt.value);
    const out = dec(outSeries[i]?.value ?? 0);
    const net = inn.minus(out);
    running = running.plus(net);
    return { key: pt.key, inn, out, net, cumulative: running };
  });

  const totalIn = months.reduce((s, m) => s.plus(m.inn), dec(0));
  const totalOut = months.reduce((s, m) => s.plus(m.out), dec(0));
  const netTotal = totalIn.minus(totalOut);

  const linePoints = months.map((m) => ({
    label: m.key.slice(-2),
    value: m.cumulative.toNumber(),
    display: formatMoney(m.cumulative),
  }));

  const empty = payments.length === 0 && expenses.length === 0;

  return (
    <AppShell user={user} title="التدفق النقدي">
      <ModuleHeader
        title="التدفق النقدي"
        action={
          <div className="flex gap-2">
            <a href={`/reports/cashflow/export?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">تصدير Excel</a>
            <Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/cashflow" period={range.period} from={range.fromStr} to={range.toStr} />

      {empty ? (
        <Empty what="حركة نقدية" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <Figure label="النقد الداخل (محصَّل)" value={formatMoney(totalIn)} strong />
            <Figure label="النقد الخارج (مصروفات)" value={formatMoney(totalOut)} />
            <Figure label="صافي التدفق" value={formatMoney(netTotal)} strong tone={netTotal.lt(0) ? 'bad' : undefined} />
          </div>

          <section className="mb-8">
            <h3 className="mb-3 text-sm font-semibold text-brand">الرصيد النقدي التراكمي</h3>
            <div className="erp-card p-6">
              <LineChartInteractive points={linePoints} />
            </div>
          </section>

          <Table headers={['الشهر', 'الداخل', 'الخارج', 'الصافي', 'التراكمي']} empty={false}>
            {months.map((m) => (
              <tr key={m.key}>
                <td className="px-4 py-3 text-txt-2" dir="ltr">{m.key}</td>
                <td className="tnum px-4 py-3 text-ok">{formatMoney(m.inn)}</td>
                <td className="tnum px-4 py-3 text-bad">{formatMoney(m.out)}</td>
                <td className={`tnum px-4 py-3 ${m.net.lt(0) ? 'text-bad' : 'text-txt'}`}>{formatMoney(m.net)}</td>
                <td className={`tnum px-4 py-3 font-medium ${m.cumulative.lt(0) ? 'text-bad' : 'text-brand'}`}>{formatMoney(m.cumulative)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </AppShell>
  );
}
