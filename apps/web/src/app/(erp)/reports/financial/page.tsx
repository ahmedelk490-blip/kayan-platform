import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatMoney,
  dec,
  balance,
  RECEIVABLE_STATUSES,
  EXPENSE_CATEGORY_AR,
  type ExpenseCategory,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'التقرير المالي' };

/**
 * التقرير المالي — الداخل والخارج للفترة.
 *
 * المبيعات المفوترة (فواتير صادرة) مقابل المصروفات المعتمدة، مع المحصَّل
 * والمستحق. ليس ربحاً محاسبياً كاملاً (لا يخصم تكلفة البضاعة المباعة) — لذا
 * يُسمّى «الصافي» صراحةً: مبيعات ناقص مصروفات، لا أكثر.
 */
export default async function FinancialReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const range = resolveRange(params);
  const { from, to } = range;

  const [invoices, receivable, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { notIn: ['DRAFT', 'VOID'] },
        issueDate: { gte: from, lte: to },
      },
      select: { total: true, paidAmount: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
      select: { total: true, paidAmount: true },
    }),
    prisma.secondaryExpense.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: 'APPROVED',
        expenseDate: { gte: from, lte: to },
      },
      select: { amount: true, category: true },
    }),
  ]);

  const invoiced = invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoices.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  const outstanding = receivable.reduce((s, i) => s.plus(balance(i.total, i.paidAmount)), dec(0));
  const expenseTotal = expenses.reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const net = invoiced.minus(expenseTotal);
  const cashFlow = collected.minus(expenseTotal);

  // المصروفات حسب البند.
  const byCategory = new Map<string, ReturnType<typeof dec>>();
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? dec(0)).plus(dec(e.amount)));
  }
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1].minus(a[1]).toNumber());

  const empty = invoices.length === 0 && expenses.length === 0;

  return (
    <AppShell user={user} title="التقرير المالي">
      <ModuleHeader
        title="التقرير المالي"
        action={
          <div className="flex gap-2">
            <a href={`/reports/financial/export?from=${range.fromStr}&to=${range.toStr}`} className="erp-btn-ghost">
              تصدير Excel
            </a>
            <Link href="/reports" className="erp-btn-ghost">
              كل التقارير
            </Link>
          </div>
        }
      />

      <ReportFilter basePath="/reports/financial" period={range.period} from={range.fromStr} to={range.toStr} />

      {empty ? (
        <Empty what="حركة مالية" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="المبيعات المفوترة" value={formatMoney(invoiced)} hint={`${invoices.length} فاتورة`} strong />
            <Figure label="المحصَّل" value={formatMoney(collected)} hint="من فواتير الفترة" />
            <Figure
              label="المستحق حالياً"
              value={formatMoney(outstanding)}
              hint="كل الفترات"
              tone={dec(outstanding).gt(0) ? 'warn' : undefined}
            />
            <Figure label="المصروفات المعتمدة" value={formatMoney(expenseTotal)} hint={`${expenses.length} مصروف`} />
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <Figure
              label="الصافي (مبيعات − مصروفات)"
              value={formatMoney(net)}
              hint="لا يخصم تكلفة البضاعة — ليس ربحاً محاسبياً كاملاً"
              strong
              tone={net.lt(0) ? 'bad' : undefined}
            />
            <Figure
              label="التدفّق النقدي (محصَّل − مصروفات)"
              value={formatMoney(cashFlow)}
              hint="النقد الفعلي الداخل ناقص الخارج"
              strong
              tone={cashFlow.lt(0) ? 'bad' : undefined}
            />
          </div>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">المصروفات حسب البند</h3>
            <Table headers={['البند', 'القيمة']} empty={categoryRows.length === 0}>
              {categoryRows.map(([cat, amount]) => (
                <tr key={cat}>
                  <td className="px-4 py-3 text-txt-2">
                    {EXPENSE_CATEGORY_AR[cat as ExpenseCategory] ?? cat}
                  </td>
                  <td className="tnum px-4 py-3 font-medium text-txt">{formatMoney(amount)}</td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-[0.7rem] text-txt-4">
              المصروفات المعتمدة فقط تدخل الحساب — المصروف بانتظار الاعتماد لا يُحتسب حتى يُعتمد.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
