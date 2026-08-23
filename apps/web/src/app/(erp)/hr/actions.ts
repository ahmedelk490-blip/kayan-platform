'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isEmployeePaymentKind } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { normalizeDigits } from '@/app/(erp)/sales/shared';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/** رقم صحيح موجب من إدخال عربي/لاتيني، أو null. */
function num(value: FormDataEntryValue | null): number | null {
  const s = normalizeDigits(String(value ?? ''));
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function nextPaymentNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `EP-${year}-`;
  const rows = await prisma.employeePayment.findMany({
    where: { tenantId, number: { startsWith: prefix } },
    select: { number: true },
  });
  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.number.slice(prefix.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** ضبط راتب الموظف الشهري ونسبة عمولته. */
export async function setCompensation(
  employeeId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('users.manage');

  const employee = await prisma.user.findFirst({
    where: { id: employeeId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!employee) return { error: 'الموظف غير موجود.' };

  const salary = num(formData.get('monthlySalary'));
  const commission = num(formData.get('commissionPercent'));
  if (salary !== null && salary < 0) return { fieldErrors: { monthlySalary: 'قيمة غير صالحة.' } };
  if (commission !== null && (commission < 0 || commission > 100))
    return { fieldErrors: { commissionPercent: 'النسبة بين 0 و100.' } };

  await prisma.user.update({
    where: { id: employeeId },
    data: { monthlySalary: salary, commissionPercent: commission },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'employee.compensation',
    entityType: 'User',
    entityId: employeeId,
    detail: `راتب ${salary ?? '—'} عمولة ${commission ?? '—'}%`,
  });

  revalidatePath('/hr');
  revalidatePath(`/hr/${employeeId}`);
  return { ok: 'تم حفظ الراتب والعمولة.' };
}

const PaymentSchema = z.object({
  employeeId: z.string().min(1, 'الموظف مطلوب.'),
  kind: z.string().refine(isEmployeePaymentKind, 'نوع الدفعة غير معروف.'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

/** تسجيل دفعة/خصم لموظف. */
export async function recordEmployeePayment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('users.manage');

  const parsed = PaymentSchema.safeParse({
    employeeId: String(formData.get('employeeId') ?? ''),
    kind: String(formData.get('kind') ?? ''),
    note: String(formData.get('note') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const amount = num(formData.get('amount'));
  if (amount === null || amount <= 0) return { fieldErrors: { amount: 'المبلغ يجب أن يكون أكبر من صفر.' } };

  const employee = await prisma.user.findFirst({
    where: { id: parsed.data.employeeId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!employee) return { error: 'الموظف غير موجود.' };

  const paidAtRaw = String(formData.get('paidAt') ?? '');
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
  const periodMonth = num(formData.get('periodMonth'));
  const periodYear = num(formData.get('periodYear'));

  const number = await nextPaymentNumber(user.tenantId);
  await prisma.employeePayment.create({
    data: {
      tenantId: user.tenantId,
      number,
      employeeId: parsed.data.employeeId,
      kind: parsed.data.kind,
      amount,
      paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
      periodMonth: periodMonth ?? null,
      periodYear: periodYear ?? null,
      note: parsed.data.note || null,
      createdById: user.id,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'employee.payment',
    entityType: 'EmployeePayment',
    entityId: parsed.data.employeeId,
    detail: `${number} ${parsed.data.kind} ${amount}`,
  });

  revalidatePath('/hr');
  revalidatePath(`/hr/${parsed.data.employeeId}`);
  return { ok: `تم تسجيل ${number}.` };
}

/**
 * صرف رواتب شهر لكل الموظفين ذوي الراتب الثابت — بضغطة واحدة.
 *
 * idempotent لكل (موظف، شهر، سنة): من صُرف له راتب هذا الشهر لا يُصرف له
 * ثانيةً، فتكرار الضغط لا يزدوج الصرف.
 */
export async function runMonthlySalaries(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('users.manage');

  const month = num(formData.get('month'));
  const year = num(formData.get('year'));
  if (month === null || month < 1 || month > 12) return { fieldErrors: { month: 'الشهر بين 1 و12.' } };
  if (year === null || year < 2000) return { fieldErrors: { year: 'سنة غير صالحة.' } };

  const employees = await prisma.user.findMany({
    where: { tenantId: user.tenantId, isActive: true, monthlySalary: { gt: 0 } },
    select: { id: true, monthlySalary: true },
  });
  if (employees.length === 0) return { error: 'لا يوجد موظفون براتب ثابت محدَّد.' };

  const existing = await prisma.employeePayment.findMany({
    where: { tenantId: user.tenantId, isDeleted: false, kind: 'SALARY', periodMonth: month, periodYear: year },
    select: { employeeId: true },
  });
  const alreadyPaid = new Set(existing.map((e) => e.employeeId));

  let created = 0;
  let skipped = 0;
  for (const e of employees) {
    if (alreadyPaid.has(e.id) || e.monthlySalary === null) {
      skipped += 1;
      continue;
    }
    const number = await nextPaymentNumber(user.tenantId);
    await prisma.employeePayment.create({
      data: {
        tenantId: user.tenantId,
        number,
        employeeId: e.id,
        kind: 'SALARY',
        amount: e.monthlySalary,
        paidAt: new Date(),
        periodMonth: month,
        periodYear: year,
        note: `راتب شهر ${month}/${year}`,
        createdById: user.id,
      },
    });
    created += 1;
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'employee.salary.run',
    entityType: 'Tenant',
    entityId: user.tenantId,
    detail: `${month}/${year}: صُرف ${created}، تُخطّي ${skipped}`,
  });

  revalidatePath('/hr');
  return {
    ok: `تم صرف ${created} راتب لشهر ${month}/${year}${skipped ? `، وتخطّي ${skipped} مصروف سلفاً` : ''}.`,
  };
}

/** حذف دفعة (soft-delete). */
export async function deleteEmployeePayment(id: string): Promise<void> {
  const user = await requirePermission('users.manage');
  const payment = await prisma.employeePayment.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    select: { id: true, employeeId: true },
  });
  if (!payment) return;

  await prisma.employeePayment.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'employee.payment.delete',
    entityType: 'EmployeePayment',
    entityId: id,
  });

  revalidatePath('/hr');
  revalidatePath(`/hr/${payment.employeeId}`);
}
