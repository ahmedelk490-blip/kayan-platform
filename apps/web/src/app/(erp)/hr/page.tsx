import type { Metadata } from 'next';
import Link from 'next/link';
import { dec, formatMoney, paymentSign } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { grantableRoles } from '@/app/(erp)/users/actions';
import { EmployeeEditModal, EmployeeCreateModal, EmployeeActiveToggle, PaymentModal, SalaryRunModal } from './HRForms';

export const metadata: Metadata = { title: 'الرواتب والموظفين' };

/**
 * الرواتب والموظفين — إضافة/تعديل/إيقاف الموظف، راتبه وعمولته، ما صُرف له،
 * ورابط لكشفه التفصيلي.
 */
export default async function HRPage() {
  const user = await requirePermission('users.manage');
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);

  const [employees, payments, roles] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, name: true, nameAr: true, isActive: true,
        monthlySalary: true, commissionPercent: true,
        role: { select: { nameAr: true, key: true } },
      },
    }),
    prisma.employeePayment.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, paidAt: { gte: yearStart } },
      select: { employeeId: true, kind: true, amount: true },
    }),
    grantableRoles(),
  ]);

  const paidByEmployee = new Map<string, ReturnType<typeof dec>>();
  for (const p of payments) {
    const cur = paidByEmployee.get(p.employeeId) ?? dec(0);
    paidByEmployee.set(p.employeeId, cur.plus(dec(p.amount).times(paymentSign(p.kind))));
  }

  const activeEmployees = employees.filter((e) => e.isActive);
  const employeeOptions = activeEmployees.map((e) => ({ value: e.id, label: e.nameAr ?? e.name }));

  return (
    <AppShell user={user} title="الرواتب والموظفين">
      <ModuleHeader
        title="الرواتب والموظفين"
        count={employees.length}
        action={
          <div className="flex flex-wrap gap-2">
            <EmployeeCreateModal roles={roles} />
            <SalaryRunModal />
            <PaymentModal employees={employeeOptions} />
          </div>
        }
      />

      <Table
        headers={['الموظف', 'الدور', 'الراتب الشهري', 'العمولة %', 'صُرف هذه السنة', 'الحالة', '']}
        empty={employees.length === 0}
      >
        {employees.map((e) => (
          <tr key={e.id} className={e.isActive ? '' : 'opacity-55'}>
            <td className="px-4 py-3 text-txt">{e.nameAr ?? e.name}</td>
            <td className="px-4 py-3 text-txt-3">{e.role.nameAr}</td>
            <td className="tnum px-4 py-3 text-txt-2">{e.monthlySalary === null ? '—' : formatMoney(e.monthlySalary)}</td>
            <td className="tnum px-4 py-3 text-txt-2">{e.commissionPercent === null ? '—' : `${dec(e.commissionPercent).toFixed(1)}٪`}</td>
            <td className="tnum px-4 py-3 font-medium text-brand">{formatMoney(paidByEmployee.get(e.id) ?? dec(0))}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2.5 py-1 text-[0.7rem] ${e.isActive ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
                {e.isActive ? 'نشط' : 'موقوف'}
              </span>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <EmployeeEditModal
                  employeeId={e.id}
                  employeeName={e.nameAr ?? e.name}
                  roleKey={e.role.key}
                  salary={e.monthlySalary === null ? null : dec(e.monthlySalary).toNumber()}
                  commission={e.commissionPercent === null ? null : dec(e.commissionPercent).toNumber()}
                  roles={roles}
                />
                <Link href={`/hr/${e.id}`} className="text-xs text-brand hover:underline">الكشف</Link>
                {e.id !== user.id && <EmployeeActiveToggle employeeId={e.id} active={e.isActive} />}
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-[0.7rem] leading-[1.9] text-txt-4">
        أضِف موظفاً، عدّل بياناته وراتبه وعمولته، أو أوقفه (الإيقاف بديل الحذف ليحفظ فواتيره وسجلّه).
        «صُرف هذه السنة» = الدفعات ناقص الخصومات والخسائر. افتح «الكشف» لتفاصيل كل موظف.
      </p>
    </AppShell>
  );
}
