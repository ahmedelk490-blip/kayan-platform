/**
 * الموارد البشرية — أنواع دفعات الموظف وحساب مستحقاته.
 *
 * منطق خالٍ من أي إطار وقاعدة بيانات، كبقية الحزمة.
 */

export const EMPLOYEE_PAYMENT_KINDS = [
  'SALARY',
  'COMMISSION',
  'SERVICE',
  'BONUS',
  'ADVANCE',
  'DEDUCTION',
] as const;
export type EmployeePaymentKind = (typeof EMPLOYEE_PAYMENT_KINDS)[number];

export const EMPLOYEE_PAYMENT_KIND_AR: Record<EmployeePaymentKind, string> = {
  SALARY: 'راتب',
  COMMISSION: 'عمولة',
  SERVICE: 'مقابل خدمة',
  BONUS: 'مكافأة',
  ADVANCE: 'سلفة',
  DEDUCTION: 'خصم',
};

/** الخصم يُنقص من مستحقات الموظف؛ الباقي يُدفع له. */
export const DEDUCTION_KINDS: EmployeePaymentKind[] = ['DEDUCTION'];

export function isEmployeePaymentKind(v: string): v is EmployeePaymentKind {
  return (EMPLOYEE_PAYMENT_KINDS as readonly string[]).includes(v);
}

/** إشارة النوع في صافي المدفوع: الخصم سالب، والباقي موجب. */
export function paymentSign(kind: string): 1 | -1 {
  return (DEDUCTION_KINDS as string[]).includes(kind) ? -1 : 1;
}
