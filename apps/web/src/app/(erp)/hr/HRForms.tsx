'use client';

import { useActionState } from 'react';
import { EMPLOYEE_PAYMENT_KINDS, EMPLOYEE_PAYMENT_KIND_AR, type EmployeePaymentKind } from '@erp/domain';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import { EditModal, FormModal } from '@/components/crud/FormModal';
import { useFormSuccess } from '@/components/crud/useFormSuccess';
import { setCompensation, recordEmployeePayment, runMonthlySalaries, type FormState } from './actions';

const KIND_OPTIONS = EMPLOYEE_PAYMENT_KINDS.map((k) => ({
  value: k,
  label: EMPLOYEE_PAYMENT_KIND_AR[k as EmployeePaymentKind],
}));

/** تعديل راتب الموظف الشهري ونسبة عمولته. */
export function CompensationModal({
  employeeId,
  employeeName,
  salary,
  commission,
}: {
  employeeId: string;
  employeeName: string;
  salary: number | null;
  commission: number | null;
}) {
  return (
    <EditModal label="الراتب/العمولة" title={`راتب وعمولة ${employeeName}`}>
      {(onSuccess) => (
        <CompensationForm
          employeeId={employeeId}
          salary={salary}
          commission={commission}
          onSuccess={onSuccess}
        />
      )}
    </EditModal>
  );
}

function CompensationForm({
  employeeId,
  salary,
  commission,
  onSuccess,
}: {
  employeeId: string;
  salary: number | null;
  commission: number | null;
  onSuccess: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(setCompensation.bind(null, employeeId), {});
  useFormSuccess(state.ok, onSuccess);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="monthlySalary"
        label="الراتب الشهري"
        type="number"
        dir="ltr"
        defaultValue={salary ?? ''}
        errors={state.fieldErrors}
        hint="اتركه فارغاً لو الموظف بلا راتب ثابت"
      />
      <Field
        name="commissionPercent"
        label="نسبة العمولة %"
        type="number"
        dir="ltr"
        defaultValue={commission ?? ''}
        errors={state.fieldErrors}
        hint="نسبة من أرباح فواتير الموظف (0–100)"
      />
      <SubmitButton label="حفظ" />
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
