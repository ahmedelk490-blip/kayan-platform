import type { Metadata } from 'next';
import Link from 'next/link';
import { dec, formatMoney, PAYMENT_METHOD_AR, ORDER_SOURCE_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';

export const metadata: Metadata = { title: 'يومية اليوم' };

/** يوم العراق (UTC+3): من منتصف ليل بغداد إلى منتصف الليل التالي. */
function iraqDayWindow(): { start: Date; end: Date; label: string } {
  const OFFSET = 3 * 60 * 60 * 1000;
  const nowIraq = new Date(Date.now() + OFFSET);
  const start = new Date(
    Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate()) - OFFSET,
  );
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    label: nowIraq.toLocaleDateString('ar-EG', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

/**
 * يومية اليوم — صفحة تقفيل واحدة بدل اللفّ على أربعة تقارير: كم بعنا، كم
 * قبضنا وبأي طريقة، كم رجع، كم صرفنا، وما أفضل صنف. كل الأرقام ليوم العراق
 * الحالي، حيّة من قاعدة البيانات.
 */
export default async function DailyPage() {
  const user = await requirePermission('reports.view');
  const { start, end, label } = iraqDayWindow();
  const window = { gte: start, lt: end };

  const [invoices, payments, returns, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { notIn: ['DRAFT', 'VOID'] },
        issueDate: window,
      },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        number: true,
        total: true,
        paidAmount: true,
        source: true,
        customer: { select: { companyName: true, contactName: true } },
        lines: { select: { description: true, quantity: true } },
      },
    }),
    prisma.payment.findMany({
      where: { tenantId: user.tenantId, paidAt: window },
      select: { amount: true, method: true },
    }),
    prisma.salesReturn.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, returnDate: window },
      select: { totalAmount: true },
    }),
    prisma.secondaryExpense.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { not: 'REJECTED' },
        expenseDate: window,
      },
      select: { amount: true, status: true },
    }),
  ]);

  const salesTotal = invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0));

  // المقبوض صافياً لكل طريقة — الدفعات العاكسة سالبة فتُخصم وحدها.
  const byMethod = new Map<string, ReturnType<typeof dec>>();
  for (const p of payments) {
    byMethod.set(p.method, (byMethod.get(p.method) ?? dec(0)).plus(dec(p.amount)));
  }
  const collected = payments.reduce((s, p) => s.plus(dec(p.amount)), dec(0));

  const returnsTotal = returns.reduce((s, r) => s.plus(dec(r.totalAmount)), dec(0));
  const expensesTotal = expenses.reduce((s, e) => s.plus(dec(e.amount)), dec(0));
  const pendingExpenses = expenses.filter((e) => e.status === 'PENDING').length;

  // أفضل الأصناف اليوم — بعدد القطع من بنود فواتير اليوم.
  const byItem = new Map<string, number>();
  for (const inv of invoices)
    for (const l of inv.lines)
      byItem.set(l.description, (byItem.get(l.description) ?? 0) + Number(l.quantity));
  const topItems = [...byItem].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const cashNet = (byMethod.get('CASH') ?? dec(0)).minus(expensesTotal);

  return (
    <AppShell user={user} title="يومية اليوم">
      <ModuleHeader
        title={`يومية اليوم — ${label}`}
        action={<Link href="/reports" className="erp-btn-ghost">كل التقارير</Link>}
      />

      {/* الأرقام الأربعة التي يُقفل بها اليوم. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">مبيعات اليوم</p>
          <p className="tnum mt-1 text-xl font-bold text-brand">{formatMoney(salesTotal)}</p>
          <p className="tnum mt-0.5 text-[0.7rem] text-txt-4">{invoices.length} فاتورة</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">المقبوض اليوم</p>
          <p className="tnum mt-1 text-xl font-bold text-ok">{formatMoney(collected)}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[0.7rem] text-txt-4">
            {[...byMethod].map(([m, v]) => (
              <span key={m} className="tnum">
                {(PAYMENT_METHOD_AR as Record<string, string>)[m] ?? m}: {formatMoney(v)}
              </span>
            ))}
            {byMethod.size === 0 && '—'}
          </p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">مرتجعات اليوم</p>
          <p className="tnum mt-1 text-xl font-bold text-warn">{formatMoney(returnsTotal)}</p>
          <p className="tnum mt-0.5 text-[0.7rem] text-txt-4">{returns.length} مرتجع</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">مصاريف اليوم</p>
          <p className="tnum mt-1 text-xl font-bold text-bad">{formatMoney(expensesTotal)}</p>
          <p className="tnum mt-0.5 text-[0.7rem] text-txt-4">
            {expenses.length} مصروف{pendingExpenses > 0 ? ` — منها ${pendingExpenses} قيد الموافقة` : ''}
          </p>
        </div>
      </div>

      {/* صافي كاش اليوم — المقبوض نقداً ناقص المصاريف. تقريب عملي لا قيد محاسبي. */}
      <div className="erp-card mb-6 flex items-center justify-between p-5">
        <div>
          <p className="text-sm font-semibold text-txt">صافي كاش اليوم</p>
          <p className="mt-0.5 text-[0.7rem] text-txt-4">المقبوض نقداً − مصاريف اليوم</p>
        </div>
        <p className={`tnum text-2xl font-bold ${cashNet.gte(0) ? 'text-ok' : 'text-bad'}`}>
          {formatMoney(cashNet)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* فواتير اليوم — مختصرة، والرقم يفتح الفاتورة. */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-brand">فواتير اليوم</h3>
          <Table headers={['الرقم', 'العميل', 'المصدر', 'الإجمالي', 'المدفوع']} empty={invoices.length === 0}>
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-card-2">
                <td className="tnum px-4 py-3">
                  <Link href={`/invoices/${inv.id}`} className="text-brand hover:underline">
                    {inv.number ?? '—'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-txt-2">
                  {inv.customer.companyName ?? inv.customer.contactName}
                </td>
                <td className="px-4 py-3 text-txt-3">
                  {inv.source ? ((ORDER_SOURCE_AR as Record<string, string>)[inv.source] ?? inv.source) : '—'}
                </td>
                <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(inv.total)}</td>
                <td className="tnum px-4 py-3 text-txt-2">{formatMoney(inv.paidAmount)}</td>
              </tr>
            ))}
          </Table>
        </section>

        {/* أفضل أصناف اليوم بعدد القطع. */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-brand">أفضل أصناف اليوم</h3>
          <div className="erp-card p-5">
            {topItems.length === 0 ? (
              <p className="text-sm text-txt-3">لا مبيعات بعد اليوم.</p>
            ) : (
              <ol className="space-y-2.5">
                {topItems.map(([desc, qty], i) => (
                  <li key={desc} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-txt-2">
                      <span className="tnum me-2 text-txt-4">{i + 1}.</span>
                      {desc}
                    </span>
                    <span className="tnum shrink-0 font-semibold text-brand">{qty} قطعة</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
