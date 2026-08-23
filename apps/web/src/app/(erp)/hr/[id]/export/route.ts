import { dec, paymentSign, EMPLOYEE_PAYMENT_KIND_AR, type EmployeePaymentKind } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { csvResponse, stampedName } from '@/app/(erp)/reports/csv';

export const dynamic = 'force-dynamic';

const day = (d: Date) => d.toISOString().slice(0, 10);

/** تصدير كشف دفعات الموظف إلى شيت Excel (CSV). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('users.manage');
  const { id } = await params;

  const [employee, payments] = await withTenant(user.tenantId, (tx) =>
    Promise.all([
      tx.user.findFirst({ where: { id, tenantId: user.tenantId }, select: { name: true, nameAr: true } }),
      tx.employeePayment.findMany({
        where: { tenantId: user.tenantId, employeeId: id, isDeleted: false },
        orderBy: { paidAt: 'desc' },
        select: { number: true, kind: true, amount: true, paidAt: true, note: true },
      }),
    ]),
  );

  const name = employee?.nameAr ?? employee?.name ?? id;
  // اسم الموظف عربي داخل الملف؛ اسم الملف لاتيني فقط — ترويسة HTTP لا تقبل
  // إلا ASCII، والاسم العربي فيها يكسر الطلب.
  const headers = ['الموظف', 'الرقم', 'النوع', 'المبلغ', 'التاريخ', 'ملاحظة'];
  const rows = payments.map((p) => [
    name,
    p.number,
    EMPLOYEE_PAYMENT_KIND_AR[p.kind as EmployeePaymentKind] ?? p.kind,
    dec(p.amount).times(paymentSign(p.kind)).toNumber(),
    day(p.paidAt),
    p.note ?? '',
  ]);

  return csvResponse(stampedName('kayan-employee-statement'), headers, rows);
}
