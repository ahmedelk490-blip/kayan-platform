import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, dec, balance, INVOICE_STATUS_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { ReportFilter, Figure, Empty } from '../Shell';
import { resolveRange } from '../range';

export const metadata: Metadata = { title: 'تقرير عميل' };

const TONE: Record<string, 'ok' | 'bad' | 'muted'> = {
  PAID: 'ok',
  ISSUED: 'muted',
  PARTIALLY_PAID: 'muted',
  DRAFT: 'muted',
  VOID: 'bad',
};

/**
 * تقرير عميل واحد — تختار العميل فترى تقريره الكامل خلال الفترة: ربحه،
 * تكلفته، المحصَّل منه، المتبقّي عليه، وكل فواتيره.
 */
export default async function SingleClientReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const range = resolveRange(params);
  const { from, to } = range;
  const customerId = (Array.isArray(params.customerId) ? params.customerId[0] : params.customerId) ?? '';

  const customers = await prisma.customer.findMany({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { contactName: 'asc' },
    select: { id: true, contactName: true, companyName: true },
  });

  const selected = customerId
    ? await prisma.customer.findFirst({
        where: { id: customerId, tenantId: user.tenantId, isDeleted: false },
        select: {
          id: true,
          contactName: true,
          companyName: true,
          invoices: {
            where: { isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: from, lte: to } },
            orderBy: { issueDate: 'desc' },
            select: {
              id: true, number: true, total: true, paidAmount: true, issueDate: true, dueDate: true, status: true,
              lines: { select: { quantity: true, variant: { select: { cost: true, product: { select: { cost: true } } } } } },
            },
          },
        },
      })
    : null;

  let invoiced = dec(0);
  let collected = dec(0);
  let cost = dec(0);
  if (selected) {
    for (const inv of selected.invoices) {
      invoiced = invoiced.plus(dec(inv.total));
      collected = collected.plus(dec(inv.paidAmount));
      for (const l of inv.lines) {
        const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
        if (unitCost !== null) cost = cost.plus(dec(l.quantity).times(dec(unitCost)));
      }
    }
  }
  const outstanding = invoiced.minus(collected);
  const profit = invoiced.minus(cost);
  const name = selected ? selected.companyName ?? selected.contactName : '';
  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' });

  return (
    <AppShell user={user} title="تقرير عميل">
      <ModuleHeader
        title="تقرير عميل"
        action={<Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>}
      />

      <ReportFilter basePath="/reports/client" period={range.period} from={range.fromStr} to={range.toStr} />

      {/* اختيار العميل — يحافظ على المدى المختار. */}
      <form method="get" action="/reports/client" className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-card-2 p-3">
        <input type="hidden" name="from" value={range.fromStr} />
        <input type="hidden" name="to" value={range.toStr} />
        <label className="block min-w-64 flex-1">
          <span className="mb-1 block text-[0.7rem] text-txt-3">اختر العميل</span>
          <select name="customerId" defaultValue={customerId} className="erp-input py-2.5">
            <option value="">— اختر —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.companyName ?? c.contactName}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="erp-btn py-2.5">عرض التقرير</button>
      </form>

      {!selected ? (
        <Empty what="عميل مختار — اختر عميلاً لعرض تقريره" />
      ) : (
        <>
          <h3 className="mb-3 text-sm font-semibold text-brand">{name}</h3>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Figure label="إجمالي الفواتير" value={formatMoney(invoiced)} hint={`${selected.invoices.length} فاتورة`} strong />
            <Figure label="المحصَّل" value={formatMoney(collected)} />
            <Figure label="المتبقّي على العميل" value={formatMoney(outstanding)} tone={outstanding.gt(0) ? 'warn' : undefined} />
            <Figure label="إجمالي التكلفة" value={formatMoney(cost)} />
            <Figure label="الربح" value={formatMoney(profit)} strong tone={profit.lt(0) ? 'bad' : undefined} />
          </div>

          <h3 className="mb-3 text-sm font-semibold text-brand">كل فواتير العميل</h3>
          <Table headers={['رقم الفاتورة', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقّي', 'الحالة']} empty={selected.invoices.length === 0}>
            {selected.invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-3 font-medium text-txt" dir="ltr">{inv.number ?? '—'}</td>
                <td className="px-4 py-3 text-txt-3">{inv.issueDate ? fmt.format(inv.issueDate) : '—'}</td>
                <td className="tnum px-4 py-3 text-txt-2">{formatMoney(inv.total)}</td>
                <td className="tnum px-4 py-3 text-ok">{formatMoney(inv.paidAmount)}</td>
                <td className="tnum px-4 py-3 text-warn">{formatMoney(balance(inv.total, inv.paidAmount))}</td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[inv.status] ?? 'muted'}>
                    {(INVOICE_STATUS_AR as Record<string, string>)[inv.status] ?? inv.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </AppShell>
  );
}
