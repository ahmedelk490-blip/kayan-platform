import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  dec,
  formatMoney,
  paymentSign,
  EMPLOYEE_PAYMENT_KIND_AR,
  type EmployeePaymentKind,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { Figure } from '../../reports/Shell';
import { PaymentModal } from '../HRForms';
import { deleteEmployeePayment } from '../actions';

export const metadata: Metadata = { title: 'كشف الموظف' };

export default async function EmployeeStatement({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('users.manage');
  const { id } = await params;
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const employee = await prisma.user.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, name: true, nameAr: true, monthlySalary: true, commissionPercent: true, role: { select: { nameAr: true } } },
  });
  if (!employee) notFound();

  const [payments, penalties, invoices] = await Promise.all([
    prisma.employeePayment.findMany({
      where: { tenantId: user.tenantId, employeeId: id, isDeleted: false },
      orderBy: { paidAt: 'desc' },
      select: { id: true, number: true, kind: true, amount: true, paidAt: true, note: true },
    }),
    prisma.penalty.findMany({
      where: { tenantId: user.tenantId, employeeId: id, status: { in: ['APPROVED', 'PAID'] } },
      select: { amount: true },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { notIn: ['DRAFT', 'VOID'] },
        createdById: id,
        issueDate: { gte: yearStart, lte: yearEnd },
      },
      select: {
        total: true,
        lines: { select: { quantity: true, variant: { select: { cost: true, product: { select: { cost: true } } } } } },
      },
    }),
  ]);

  // أداء الموظف من فواتيره هذه السنة.
  let revenue = dec(0);
  let cost = dec(0);
  for (const inv of invoices) {
    revenue = revenue.plus(dec(inv.total));
    for (const l of inv.lines) {
      const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
      if (unitCost !== null) cost = cost.plus(dec(l.quantity).times(dec(unitCost)));
    }
  }
  const profit = revenue.minus(cost);
  const commissionRate = employee.commissionPercent === null ? dec(0) : dec(employee.commissionPercent);
  const commissionDue = profit.gt(0) ? profit.times(commissionRate).dividedBy(100) : dec(0);

  // ما صُرف له وما خُصم منه (كل السجلّ).
  let paidOut = dec(0);
  let deducted = dec(0);
  const byKind = new Map<string, ReturnType<typeof dec>>();
  for (const p of payments) {
    byKind.set(p.kind, (byKind.get(p.kind) ?? dec(0)).plus(dec(p.amount)));
    if (paymentSign(p.kind) < 0) deducted = deducted.plus(dec(p.amount));
    else paidOut = paidOut.plus(dec(p.amount));
  }
  const penaltyTotal = penalties.reduce((s, p) => s.plus(dec(p.amount)), dec(0));
  const netPaid = paidOut.minus(deducted).minus(penaltyTotal);

  const name = employee.nameAr ?? employee.name;
  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' });

  return (
    <AppShell user={user} title={`كشف ${name}`}>
      <ModuleHeader
        title={name}
        action={
          <div className="flex gap-2">
            <PaymentModal employees={[{ value: id, label: name }]} defaultEmployeeId={id} trigger="تسجيل دفعة" />
            <Link href="/hr" className="erp-btn-ghost">رجوع</Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="الراتب الشهري" value={employee.monthlySalary === null ? '—' : formatMoney(employee.monthlySalary)} hint={employee.role.nameAr} />
        <Figure label={`ربح فواتيره (${year})`} value={formatMoney(profit)} hint={`${invoices.length} فاتورة`} strong tone={profit.lt(0) ? 'bad' : undefined} />
        <Figure label="العمولة المستحقة" value={formatMoney(commissionDue)} hint={`${commissionRate.toFixed(1)}٪ من الربح`} />
        <Figure label="صافي المصروف له" value={formatMoney(netPaid)} hint="مدفوعات ناقص خصومات وجزاءات" strong tone={netPaid.lt(0) ? 'warn' : undefined} />
      </div>

      {penaltyTotal.gt(0) && (
        <p className="mb-4 rounded-lg border border-warn bg-warn-soft px-4 py-2.5 text-xs text-warn">
          جزاءات معتمدة على الموظف بقيمة {formatMoney(penaltyTotal)} (من شاشة الهالك والجزاءات) — مخصومة من الصافي أعلاه.
        </p>
      )}

      <h3 className="mb-3 text-sm font-semibold text-brand">الدفعات والخصومات</h3>
      <Table headers={['الرقم', 'النوع', 'المبلغ', 'التاريخ', 'ملاحظة', '']} empty={payments.length === 0}>
        {payments.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 text-txt-3" dir="ltr">{p.number}</td>
            <td className="px-4 py-3 text-txt-2">{EMPLOYEE_PAYMENT_KIND_AR[p.kind as EmployeePaymentKind] ?? p.kind}</td>
            <td className={`tnum px-4 py-3 font-medium ${paymentSign(p.kind) < 0 ? 'text-bad' : 'text-txt'}`}>
              {paymentSign(p.kind) < 0 ? '-' : ''}{formatMoney(p.amount)}
            </td>
            <td className="px-4 py-3 text-txt-3">{fmt.format(p.paidAt)}</td>
            <td className="px-4 py-3 text-txt-3">{p.note ?? '—'}</td>
            <td className="px-4 py-3 text-end">
              <form action={deleteEmployeePayment.bind(null, p.id)}>
                <button type="submit" className="text-xs text-bad hover:underline">حذف</button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
    </AppShell>
  );
}
