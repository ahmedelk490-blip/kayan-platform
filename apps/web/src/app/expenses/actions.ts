'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isExpenseCategory, APPROVAL_TRANSITIONS, isApprovalStatus } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { nextOpsNumber, parseDateOr, type FormState } from '@/lib/ops';

const Schema = z.object({
  expenseDate: z.string().optional(),
  category: z.string().refine(isExpenseCategory, 'بند مصروف غير معروف.'),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر.'),
  employeeId: z.string().optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

function read(formData: FormData) {
  return {
    expenseDate: String(formData.get('expenseDate') ?? ''),
    category: String(formData.get('category') ?? ''),
    amount: String(formData.get('amount') ?? ''),
    employeeId: String(formData.get('employeeId') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  };
}

export async function createExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('expenses.write');
  const parsed = Schema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const expense = await prisma.secondaryExpense.create({
    data: {
      tenantId: user.tenantId,
      number: await nextOpsNumber('secondaryExpense', 'EXP', user.tenantId),
      expenseDate: parseDateOr(parsed.data.expenseDate),
      category: parsed.data.category,
      amount: parsed.data.amount,
      employeeId: parsed.data.employeeId || null,
      notes: parsed.data.notes || null,
      // Always starts unapproved, including when a manager files it. The
      // approval is a separate act by design, and skipping it for some
      // people is how the control stops being a control.
      status: 'PENDING',
      createdById: user.id,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'expense.create',
    entityType: 'SecondaryExpense',
    entityId: expense.id,
    detail: `${expense.number} ${parsed.data.category} ${parsed.data.amount}`,
  });

  revalidatePath('/expenses');
  return { ok: `تم تسجيل المصروف ${expense.number} بانتظار الاعتماد.` };
}

export async function setExpenseStatus(id: string, next: string): Promise<void> {
  const user = await requirePermission('expenses.approve');
  if (!isApprovalStatus(next)) return;

  const expense = await prisma.secondaryExpense.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!expense || !isApprovalStatus(expense.status)) return;
  if (!APPROVAL_TRANSITIONS[expense.status].includes(next)) return;

  // A person approving their own claim defeats the separation entirely.
  if (next === 'APPROVED' && expense.createdById === user.id) {
    redirect('/expenses?err=self');
  }

  await prisma.secondaryExpense.update({
    where: { id },
    data: {
      status: next,
      approvedById: next === 'APPROVED' ? user.id : null,
      approvedAt: next === 'APPROVED' ? new Date() : null,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'expense.status',
    entityType: 'SecondaryExpense',
    entityId: id,
    detail: `${expense.number} ${expense.status} -> ${next}`,
  });

  revalidatePath('/expenses');
}

export async function deleteExpense(id: string): Promise<void> {
  const user = await requirePermission('expenses.write');
  const expense = await prisma.secondaryExpense.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!expense) redirect('/expenses');

  // An approved expense has already counted against a reported profit.
  // Removing it would rewrite that period silently.
  if (expense.status === 'APPROVED') redirect('/expenses?err=approved');

  await prisma.secondaryExpense.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'expense.softDelete',
    entityType: 'SecondaryExpense',
    entityId: id,
    detail: expense.number,
  });

  revalidatePath('/expenses');
}
