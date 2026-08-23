'use client';

import { useActionState } from 'react';
import { EMPLOYEE_PAYMENT_KINDS, EMPLOYEE_PAYMENT_KIND_AR, type EmployeePaymentKind } from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import { EditModal, FormModal } from '@/components/crud/FormModal';
import { useFormSuccess } from '@/components/crud/useFormSuccess';
import { updateEmployee, recordEmployeePayment, runMonthlySalaries, type FormState } from './actions';
import { createUser, setUserActive } from '@/app/(erp)/users/actions';

const KIND_OPTIONS = EMPLOYEE_PAYMENT_KINDS.map((k) => ({
  value: k,
  label: EMPLOYEE_PAYMENT_KIND_AR[k as EmployeePaymentKind],
}));

interface RoleOption {
  value: string;
  label: string;
}

/** تعديل بيانات الموظف: الاسم، الدور، الراتب، العمولة. */
export function EmployeeEditModal({
  employeeId,
  employeeName,
  roleKey,
  salary,
  commission,
  roles,
}: {
  employeeId: string;
  employeeName: string;
  roleKey: string;
  salary: number | null;
  commission: number | null;
  roles: RoleOption[];
}) {
  return (
    <EditModal label="تعديل" title={`تعديل ${employeeName}`}>
      {(onSuccess) => (
        <EmployeeEditForm
          employeeId={employeeId}
          employeeName={employeeName}
          roleKey={roleKey}
          salary={salary}
          commission={commission}
          roles={roles}
          onSuccess={onSuccess}
        />
      )}
    </EditModal>
  );
}

function EmployeeEditForm({
  employeeId,
  employeeName,
  roleKey,
  salary,
  commission,
  roles,
  onSuccess,
}: {
  employeeId: string;
  employeeName: string;
  roleKey: string;
  salary: number | null;
  commission: number | null;
  roles: RoleOption[];
  onSuccess: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateEmployee.bind(null, employeeId), {});
  useFormSuccess(state.ok, onSuccess);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field name="nameAr" label="اسم الموظف" required defaultValue={employeeName} errors={state.fieldErrors} />
      <Select name="roleKey" label="الدور" options={roles} defaultValue={roleKey} errors={state.fieldErrors} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="monthlySalary" label="الراتب الشهري" type="number" dir="ltr" defaultValue={salary ?? ''} errors={state.fieldErrors} hint="فارغ = بلا راتب ثابت" />
        <Field name="commissionPercent" label="نسبة العمولة %" type="number" dir="ltr" defaultValue={commission ?? ''} errors={state.fieldErrors} hint="0–100" />
      </div>
      <SubmitButton label="حفظ" />
    </form>
  );
}

/** إضافة موظف جديد (حساب + راتب اختياري). */
export function EmployeeCreateModal({ roles }: { roles: RoleOption[] }) {
  return (
    <FormModal trigger="موظف جديد" title="موظف جديد">
      {(onSuccess) => <EmployeeCreateForm roles={roles} onSuccess={onSuccess} />}
    </FormModal>
  );
}

function EmployeeCreateForm({ roles, onSuccess }: { roles: RoleOption[]; onSuccess: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(createUser, {});
  useFormSuccess(state.ok, onSuccess);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field name="nameAr" label="اسم الموظف" required errors={state.fieldErrors} />
      <Field name="email" label="البريد الإلكتروني (للدخول)" type="email" dir="ltr" required errors={state.fieldErrors} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="roleKey" label="الدور" required options={roles} placeholder="اختر الدور" errors={state.fieldErrors} />
        <Field name="password" label="كلمة المرور" type="password" required errors={state.fieldErrors} hint="8 أحرف على الأقل" />
      </div>
      <SubmitButton label="إنشاء الموظف" />
    </form>
  );
}

/** تفعيل/إيقاف موظف — الإيقاف بديل الحذف (يحفظ السجلّ والفواتير المربوطة). */
export function EmployeeActiveToggle({ employeeId, active }: { employeeId: string; active: boolean }) {
  return (
    <form action={setUserActive.bind(null, employeeId, !active)}>
      <button type="submit" className={`text-xs hover:underline ${active ? 'text-bad' : 'text-ok'}`}>
        {active ? 'إيقاف' : 'تفعيل'}
      </button>
    </form>
  );
}

/** تسجيل دفعة/خصم لموظف. defaultEmployeeId يثبّت الموظف على صفحة الكشف. */
export function PaymentModal({
  employees,
  defaultEmployeeId,
  trigger = 'تسجيل دفعة',
}: {
  employees: { value: string; label: string }[];
  defaultEmployeeId?: string;
  trigger?: string;
}) {
  return (
    <FormModal trigger={trigger} title="تسجيل دفعة / خصم">
      {(onSuccess) => (
        <PaymentForm employees={employees} defaultEmployeeId={defaultEmployeeId} onSuccess={onSuccess} />
      )}
    </FormModal>
  );
}

/** صرف رواتب الشهر لكل الموظفين بضغطة. */
export function SalaryRunModal() {
  const now = new Date();
  return (
    <FormModal trigger="صرف رواتب الشهر" title="صرف رواتب الشهر">
      {(onSuccess) => <SalaryRunForm month={now.getMonth() + 1} year={now.getFullYear()} onSuccess={onSuccess} />}
    </FormModal>
  );
}

function SalaryRunForm({ month, year, onSuccess }: { month: number; year: number; onSuccess: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(runMonthlySalaries, {});
  useFormSuccess(state.ok, onSuccess);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <p className="text-xs leading-[1.9] text-txt-3">
        يصرف الراتب الشهري لكل موظف براتب ثابت. آمن للتكرار — من صُرف له هذا الشهر لا يُصرف له
        ثانيةً.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="month" label="الشهر (1–12)" type="number" dir="ltr" required defaultValue={month} errors={state.fieldErrors} />
        <Field name="year" label="السنة" type="number" dir="ltr" required defaultValue={year} errors={state.fieldErrors} />
      </div>
      <SubmitButton label="صرف الرواتب" />
    </form>
  );
}

function PaymentForm({
  employees,
  defaultEmployeeId,
  onSuccess,
}: {
  employees: { value: string; label: string }[];
  defaultEmployeeId?: string;
  onSuccess: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(recordEmployeePayment, {});
  useFormSuccess(state.ok, onSuccess);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      {defaultEmployeeId ? (
        <input type="hidden" name="employeeId" value={defaultEmployeeId} />
      ) : (
        <Select name="employeeId" label="الموظف" required options={employees} placeholder="اختر الموظف" errors={state.fieldErrors} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="kind" label="النوع" required options={KIND_OPTIONS} placeholder="اختر النوع" errors={state.fieldErrors} />
        <Field name="amount" label="المبلغ" type="number" dir="ltr" required errors={state.fieldErrors} />
      </div>
      <Field name="paidAt" label="التاريخ" type="date" dir="ltr" errors={state.fieldErrors} />
      <TextArea name="note" label="ملاحظة" rows={2} errors={state.fieldErrors} />
      <SubmitButton label="تسجيل" />
    </form>
  );
}
