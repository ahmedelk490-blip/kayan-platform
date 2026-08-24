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

// ── المصروفات الثابتة المتكرّرة ──────────────────────────────

import { can, isExpenseCategory as isCat } from '@erp/domain';

const RecurringSchema = z.object({
  nameAr: z.string().trim().min(2, 'اسم المصروف مطلوب.').max(120),
  category: z.string().refine(isCat, 'بند مصروف غير معروف.'),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر.'),
});

/** إضافة مصروف ثابت (قالب) — لا يُخصَم حتى يُسجَّل للشهر. */
export async function addRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('expenses.write');
  const parsed = RecurringSchema.safeParse({
    nameAr: String(formData.get('nameAr') ?? ''),
    category: String(formData.get('category') ?? ''),
    amount: String(formData.get('amount') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  await prisma.recurringExpense.create({
    data: {
      tenantId: user.tenantId,
      nameAr: parsed.data.nameAr,
      category: parsed.data.category,
      amount: parsed.data.amount,
    },
  });
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'recurring.create', entityType: 'RecurringExpense', entityId: parsed.data.nameAr, detail: `${parsed.data.nameAr} ${parsed.data.amount}` });
  revalidatePath('/expenses');
  return { ok: `أُضيف المصروف الثابت «${parsed.data.nameAr}».` };
}

/** حذف مصروف ثابت (لا يمسّ ما سُجِّل منه سابقاً). */
export async function deleteRecurring(id: string): Promise<void> {
  const user = await requirePermission('expenses.write');
  await prisma.recurringExpense.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidatePath('/expenses');
}

/**
 * تسجيل المصروفات الثابتة لشهرٍ ما — يُنشئ مصروفاً لكل قالب نشط، مرة واحدة
 * لكل شهر (رقم فريد لكل قالب/شهر يمنع التكرار). من يملك الاعتماد تُسجَّل
 * معتمدة فتُخصَم فوراً؛ وإلا بانتظار الاعتماد.
 */
export async function postRecurring(monthKey: string): Promise<void> {
  const user = await requirePermission('expenses.write');
  const yyyymm = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : new Date().toISOString().slice(0, 7);
  const canApprove = can(user.role, 'expenses.approve');

  const templates = await prisma.recurringExpense.findMany({
    where: { tenantId: user.tenantId, isActive: true },
  });
  const date = new Date(`${yyyymm}-01T12:00:00`);
  const compact = yyyymm.replace('-', '');

  for (const t of templates) {
    const number = `REC-${compact}-${t.id.slice(-6)}`;
    const exists = await prisma.secondaryExpense.findFirst({
      where: { tenantId: user.tenantId, number },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.secondaryExpense.create({
      data: {
        tenantId: user.tenantId,
        number,
        expenseDate: date,
        category: t.category,
        amount: t.amount,
        notes: `مصروف ثابت: ${t.nameAr}`,
        status: canApprove ? 'APPROVED' : 'PENDING',
        approvedById: canApprove ? user.id : null,
        approvedAt: canApprove ? new Date() : null,
        createdById: user.id,
      },
    });
  }
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'recurring.post', entityType: 'RecurringExpense', entityId: yyyymm, detail: `${templates.length} قالب لشهر ${yyyymm}` });
  revalidatePath('/expenses');
}
