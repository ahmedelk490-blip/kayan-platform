import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { HBarChartInteractive } from '@/components/dashboard/HBarChartInteractive';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'تحليل العملاء' };

/**
 * تحليل العملاء — لكل عميل: عدد فواتيره، إجمالي المفوتر، المحصَّل، المتبقّي،
 * نسبة التحصيل، وربحه (الإيراد ناقص تكلفة منتجاته). مع رسم تفاعلي لأعلى
 * العملاء تحصيلاً.
 */
export default async function ClientsReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const range = resolveRange(params);
  const { from, to } = range;

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: user.tenantId,
      isDeleted: false,
      status: { notIn: ['DRAFT', 'VOID'] },
      issueDate: { gte: from, lte: to },
    },
    select: {
      total: true,
      paidAmount: true,
      issueDate: true,
      customerId: true,
      customer: { select: { contactName: true, companyName: true } },
      lines: { select: { quantity: true, variant: { select: { cost: true, product: { select: { cost: true } } } } } },
    },
  });

  type Row = {
    id: string;
    name: string;
    count: number;
    invoiced: ReturnType<typeof dec>;
    collected: ReturnType<typeof dec>;
    cost: ReturnType<typeof dec>;
    last: Date | null;
  };
  const byClient = new Map<string, Row>();
  for (const inv of invoices) {
    const id = inv.customerId;
    const name = inv.customer.companyName ?? inv.customer.contactName;
    const row = byClient.get(id) ?? { id, name, count: 0, invoiced: dec(0), collected: dec(0), cost: dec(0), last: null };
    row.count += 1;
    row.invoiced = row.invoiced.plus(dec(inv.total));
    row.collected = row.collected.plus(dec(inv.paidAmount));
    for (const l of inv.lines) {
      const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
      if (unitCost !== null) row.cost = row.cost.plus(dec(l.quantity).times(dec(unitCost)));
    }
    const d = inv.issueDate as Date | null;
    if (d && (!row.last || d > row.last)) row.last = d;
    byClient.set(id, row);
  }

  const rows = [...byClient.values()].sort((a, b) => b.invoiced.minus(a.invoiced).toNumber());
  const totalInvoiced = rows.reduce((s, r) => s.plus(r.invoiced), dec(0));
  const totalCollected = rows.reduce((s, r) => s.plus(r.collected), dec(0));
  const totalOutstanding = totalInvoiced.minus(totalCollected);

  const topClients = rows.slice(0, 8).map((r) => ({
    label: r.name,
    value: r.collected.toNumber(),
    display: formatMoney(r.collected),
  }));

  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' });

  return (
    <AppShell user={user} title="تحليل العملاء">
      <ModuleHeader
        title="تحليل العملاء"
        action={
          <div className="flex gap-2">
            <a href={`/reports/clients/export?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">تصدير Excel</a>
            <Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/clients" period={range.period} from={range.fromStr} to={range.toStr} />

      {rows.length === 0 ? (
        <Empty what="فواتير عملاء" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="عدد العملاء" value={String(rows.length)} strong />
            <Figure label="إجمالي المفوتر" value={formatMoney(totalInvoiced)} strong />
            <Figure label="المحصَّل" value={formatMoney(totalCollected)} />
            <Figure label="المتبقّي" value={formatMoney(totalOutstanding)} tone={totalOutstanding.gt(0) ? 'warn' : undefined} />
          </div>

          <Table
            headers={['العميل', 'الفواتير', 'إجمالي المفوتر', 'المحصَّل', 'المتبقّي', 'نسبة التحصيل', 'الربح', 'آخر فاتورة']}
            empty={false}
          >
            {rows.map((r) => {
              const outstanding = r.invoiced.minus(r.collected);
              const rate = r.invoiced.lte(0) ? dec(0) : r.collected.dividedBy(r.invoiced).times(100);
              const profit = r.invoiced.minus(r.cost);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-txt">{r.name}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{r.count}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatMoney(r.invoiced)}</td>
                  <td className="tnum px-4 py-3 text-ok">{formatMoney(r.collected)}</td>
                  <td className={`tnum px-4 py-3 ${outstanding.gt(0) ? 'text-warn' : 'text-txt-3'}`}>{formatMoney(outstanding)}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{rate.toFixed(0)}٪</td>
                  <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(profit)}</td>
                  <td className="px-4 py-3 text-txt-3">{r.last ? fmt.format(r.last) : '—'}</td>
                </tr>
              );
            })}
          </Table>

          <section className="mt-8">
            <h3 className="mb-3 text-sm font-semibold text-brand">أعلى العملاء تحصيلاً</h3>
            <div className="erp-card p-6">
              <HBarChartInteractive points={topClients} />
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
