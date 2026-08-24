import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'مقارنة الفترة' };

/**
 * مقارنة الفترة — الفترة المختارة مقابل الفترة السابقة لها بنفس الطول.
 * لكل مقياس (مبيعات، مصروفات، صافي): قيمته الآن، سابقاً، ونسبة التغيّر.
 */
export default async function ComparisonReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const range = resolveRange(params);
  const { from, to } = range;

  // الفترة السابقة بنفس الطول، منتهيةً قُبيل بداية الحالية.
  const lenMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - lenMs);

  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: prevFrom, lte: to } },
      select: { total: true, issueDate: true },
    }),
    prisma.secondaryExpense.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: prevFrom, lte: to } },
      select: { amount: true, expenseDate: true },
    }),
  ]);

  const inRange = (d: Date | null, a: Date, b: Date) => !!d && d >= a && d <= b;
  const sum = (rows: { v: ReturnType<typeof dec>; d: Date | null }[], a: Date, b: Date) =>
    rows.filter((r) => inRange(r.d, a, b)).reduce((s, r) => s.plus(r.v), dec(0));

  const inv = invoices.map((i) => ({ v: dec(i.total), d: i.issueDate as Date | null }));
  const exp = expenses.map((e) => ({ v: dec(e.amount), d: e.expenseDate as Date | null }));

  const curSales = sum(inv, from, to);
  const prevSales = sum(inv, prevFrom, prevTo);
  const curExp = sum(exp, from, to);
  const prevExp = sum(exp, prevFrom, prevTo);
  const curNet = curSales.minus(curExp);
  const prevNet = prevSales.minus(prevExp);

  const pct = (cur: ReturnType<typeof dec>, prev: ReturnType<typeof dec>): number | null => {
    if (prev.eq(0)) return cur.eq(0) ? 0 : null;
    return cur.minus(prev).dividedBy(prev.abs()).times(100).toNumber();
  };

  const metrics = [
    { label: 'المبيعات المفوترة', cur: curSales, prev: prevSales, good: 'up' as const },
    { label: 'المصروفات المعتمدة', cur: curExp, prev: prevExp, good: 'down' as const },
    { label: 'الصافي (مبيعات − مصروفات)', cur: curNet, prev: prevNet, good: 'up' as const },
  ];

  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' });
  const empty = invoices.length === 0 && expenses.length === 0;

  return (
    <AppShell user={user} title="مقارنة الفترة">
      <ModuleHeader
        title="مقارنة الفترة"
        action={
          <div className="flex gap-2">
            <a href={`/reports/comparison/export?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">تصدير Excel</a>
            <Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/comparison" period={range.period} from={range.fromStr} to={range.toStr} />

      <p className="mb-6 text-xs text-txt-3">
        تُقارن الفترة المختارة ({fmt.format(from)} – {fmt.format(to)}) بالفترة السابقة لها بنفس الطول
        ({fmt.format(prevFrom)} – {fmt.format(prevTo)}).
      </p>

      {empty ? (
        <Empty what="بيانات للمقارنة" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {metrics.map((m) => {
              const change = pct(m.cur, m.prev);
              const positive = change !== null && change >= 0;
              const favorable = change === null ? undefined : m.good === 'up' ? positive : !positive;
              return (
                <Figure
                  key={m.label}
                  label={m.label}
                  value={formatMoney(m.cur)}
                  hint={change === null ? 'لا مقارنة (الفترة السابقة صفر)' : `${positive ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}٪ عن السابق`}
                  strong
                  tone={favorable === undefined ? undefined : favorable ? undefined : 'bad'}
                />
              );
            })}
          </div>

          <Table headers={['المقياس', 'الفترة الحالية', 'الفترة السابقة', 'الفرق', 'نسبة التغيّر']} empty={false}>
            {metrics.map((m) => {
              const diff = m.cur.minus(m.prev);
              const change = pct(m.cur, m.prev);
              return (
                <tr key={m.label}>
                  <td className="px-4 py-3 text-txt">{m.label}</td>
                  <td className="tnum px-4 py-3 font-medium text-txt">{formatMoney(m.cur)}</td>
                  <td className="tnum px-4 py-3 text-txt-3">{formatMoney(m.prev)}</td>
                  <td className={`tnum px-4 py-3 ${diff.lt(0) ? 'text-bad' : 'text-ok'}`}>{formatMoney(diff)}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}٪`}</td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </AppShell>
  );
}
