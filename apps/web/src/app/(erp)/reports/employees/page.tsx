import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatMoney,
  periodRange,
  isPeriod,
  dec,
  type Period,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { PeriodTabs, Figure, Empty } from '../Shell';

export const metadata: Metadata = { title: 'ربحية الموظفين' };

/**
 * ربحية كل موظف — من الفواتير التي أنشأها.
 *
 * كل فاتورة مربوطة بمنشئها (createdById). ربح الموظف = إيراد فواتيره ناقص
 * تكلفة منتجاتها (تكلفة المتغيّر، وإلا تكلفة المنتج). الفاتورة بلا منشئ
 * تُجمَّع تحت «غير محدَّد».
 */
export default async function EmployeeReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('cost.margin');
  const params = await searchParams;
  const raw = Array.isArray(params.period) ? params.period[0] : params.period;
  const period: Period = raw && isPeriod(raw) ? raw : 'YEAR';
  const { from, to } = periodRange(period);

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: user.tenantId,
      isDeleted: false,
      status: { notIn: ['DRAFT', 'VOID'] },
      issueDate: { gte: from, lte: to },
    },
    select: {
      total: true,
      createdById: true,
      createdBy: { select: { nameAr: true, name: true } },
      lines: {
        select: {
          quantity: true,
          variant: { select: { cost: true, product: { select: { cost: true } } } },
        },
      },
    },
  });

  type Row = {
    id: string;
    name: string;
    invoices: number;
    revenue: ReturnType<typeof dec>;
    cost: ReturnType<typeof dec>;
    costKnown: boolean;
  };
  const byEmployee = new Map<string, Row>();

  for (const inv of invoices) {
    const id = inv.createdById ?? '—';
    const name = inv.createdBy?.nameAr ?? inv.createdBy?.name ?? 'غير محدَّد';
    const row =
      byEmployee.get(id) ??
      { id, name, invoices: 0, revenue: dec(0), cost: dec(0), costKnown: true };
    row.invoices += 1;
    row.revenue = row.revenue.plus(dec(inv.total));
    for (const l of inv.lines) {
      const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
      if (unitCost === null) row.costKnown = false;
      else row.cost = row.cost.plus(dec(l.quantity).times(dec(unitCost)));
    }
    byEmployee.set(id, row);
  }

  const rows = [...byEmployee.values()].sort((a, b) =>
    b.revenue.minus(b.cost).minus(a.revenue.minus(a.cost)).toNumber(),
  );

  const totalRevenue = rows.reduce((s, r) => s.plus(r.revenue), dec(0));
  const totalCost = rows.reduce((s, r) => s.plus(r.cost), dec(0));
  const totalProfit = totalRevenue.minus(totalCost);
  const totalInvoices = rows.reduce((s, r) => s + r.invoices, 0);

  return (
    <AppShell user={user} title="ربحية الموظفين">
      <ModuleHeader
        title="ربحية الموظفين"
        action={
          <div className="flex gap-2">
            <a href={`/reports/employees/export?period=${period}`} className="erp-btn-ghost">
              تصدير Excel
            </a>
            <Link href="/reports" className="erp-btn-ghost">
              كل التقارير
            </Link>
          </div>
        }
      />

      <PeriodTabs basePath="/reports/employees" active={period} />

      {rows.length === 0 ? (
        <Empty what="فواتير للموظفين" />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="عدد الفواتير" value={String(totalInvoices)} strong />
            <Figure label="إجمالي الإيراد" value={formatMoney(totalRevenue)} strong />
            <Figure label="إجمالي التكلفة" value={formatMoney(totalCost)} />
            <Figure label="إجمالي الربح" value={formatMoney(totalProfit)} strong tone={totalProfit.lt(0) ? 'bad' : undefined} />
          </div>

          <Table
            headers={['الموظف', 'عدد الفواتير', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %']}
            empty={false}
          >
            {rows.map((r) => {
              const profit = r.revenue.minus(r.cost);
              const margin = r.revenue.lte(0) ? null : profit.dividedBy(r.revenue).times(100);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-txt">{r.name}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{r.invoices}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatMoney(r.revenue)}</td>
                  <td className="tnum px-4 py-3 text-txt-3">
                    {formatMoney(r.cost)}
                    {!r.costKnown && <span className="ms-1 text-[0.7rem] text-warn">(ناقصة)</span>}
                  </td>
                  <td className={`tnum px-4 py-3 font-medium ${profit.lt(0) ? 'text-bad' : 'text-brand'}`}>
                    {formatMoney(profit)}
                  </td>
                  <td className="tnum px-4 py-3 text-txt-3">
                    {margin === null ? '—' : `${margin.toFixed(1)}٪`}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-2 text-[0.7rem] text-txt-4">
            الربح = إيراد فواتير الموظف ناقص تكلفة منتجاتها. «(ناقصة)» تعني أن بعض المنتجات
            بلا تكلفة محدَّدة فالتكلفة الحقيقية أعلى. لا تشمل رواتب أو عمولات — تلك في كشف الموظف.
          </p>
        </>
      )}
    </AppShell>
  );
}
