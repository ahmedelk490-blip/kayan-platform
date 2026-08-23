import type { Metadata } from 'next';
import Link from 'next/link';
import { dec, formatMoney, paymentSign } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { CompensationModal, PaymentModal } from './HRForms';

export const metadata: Metadata = { title: 'الرواتب والموظفين' };

/**
 * الرواتب والموظفين — راتب وعمولة كل موظف، وإجمالي ما صُرف له هذه السنة،
 * ورابط لكشفه التفصيلي.
 */
export default async function HRPage() {
  const user = await requirePermission('users.manage');
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);

  const [employees, payments] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, nameAr: true, monthlySalary: true, commissionPercent: true, role: { select: { nameAr: true } } },
    }),
    prisma.employeePayment.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, paidAt: { gte: yearStart } },
      select: { employeeId: true, kind: true, amount: true },
    }),
  ]);

  // صافي ما صُرف لكل موظف هذه السنة (المدفوع ناقص الخصومات).
  const paidByEmployee = new Map<string, ReturnType<typeof dec>>();
  for (const p of payments) {
    const cur = paidByEmployee.get(p.employeeId) ?? dec(0);
    paidByEmployee.set(p.employeeId, cur.plus(dec(p.amount).times(paymentSign(p.kind))));
  }

  const employeeOptions = employees.map((e) => ({ value: e.id, label: e.nameAr ?? e.name }));

  return (
    <AppShell user={user} title="الرواتب والموظفين">
      <ModuleHeader
        title="الرواتب والموظفين"
        count={employees.length}
        action={<PaymentModal employees={employeeOptions} />}
      />

      <Table
        headers={['الموظف', 'الدور', 'الراتب الشهري', 'العمولة %', 'صُرف هذه السنة', '']}
        empty={employees.length === 0}
      >
        {employees.map((e) => (
          <tr key={e.id}>
            <td className="px-4 py-3 text-txt">{e.nameAr ?? e.name}</td>
            <td className="px-4 py-3 text-txt-3">{e.role.nameAr}</td>
            <td className="tnum px-4 py-3 text-txt-2">
              {e.monthlySalary === null ? '—' : formatMoney(e.monthlySalary)}
            </td>
            <td className="tnum px-4 py-3 text-txt-2">
              {e.commissionPercent === null ? '—' : `${dec(e.commissionPercent).toFixed(1)}٪`}
            </td>
            <td className="tnum px-4 py-3 font-medium text-brand">
              {formatMoney(paidByEmployee.get(e.id) ?? dec(0))}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <CompensationModal
                  employeeId={e.id}
                  employeeName={e.nameAr ?? e.name}
                  salary={e.monthlySalary === null ? null : dec(e.monthlySalary).toNumber()}
                  commission={e.commissionPercent === null ? null : dec(e.commissionPercent).toNumber()}
                />
                <Link href={`/hr/${e.id}`} className="text-xs text-brand hover:underline">
                  الكشف
                </Link>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-[0.7rem] leading-[1.9] text-txt-4">
        «صُرف هذه السنة» = مجموع الدفعات (راتب، عمولة، مقابل خدمة، مكافأة، سلفة) ناقص الخصومات.
        افتح «الكشف» لتفاصيل كل موظف: دفعاته وخصوماته وربح فواتيره وصافي مستحقاته.
      </p>
    </AppShell>
  );
}
