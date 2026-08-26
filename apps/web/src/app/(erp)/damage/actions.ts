'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  damageTotal,
  penaltyExceedsDamage,
  DAMAGE_TRANSITIONS,
  PENALTY_TRANSITIONS,
  isDamageStatus,
  isPenaltyStatus,
  isPriceService,
  PRICE_SERVICE_AR,
  dec,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { nextOpsNumber, parseDateOr, type FormState } from '@/lib/ops';

// ── Damage records ──────────────────────────────────────────

const Schema = z.object({
  productId: z.string().trim().min(1, 'اختر المنتج.'),
  colorId: z.string().trim().optional().or(z.literal('')),
  service: z.string().trim().optional().or(z.literal('')),
  quantity: z.coerce.number().positive('العدد يجب أن يكون أكبر من صفر.'),
  manualCost: z.coerce.number().nonnegative('التكلفة لا تكون سالبة.').optional(),
});

function read(formData: FormData) {
  const manual = String(formData.get('manualCost') ?? '').trim();
  return {
    productId: String(formData.get('productId') ?? ''),
    colorId: String(formData.get('colorId') ?? ''),
    service: String(formData.get('service') ?? ''),
    quantity: String(formData.get('quantity') ?? ''),
    // فارغ ⇒ تلقائي. نمرّره undefined لا 0 حتى لا يُفهم صفراً مقصوداً.
    manualCost: manual === '' ? undefined : manual,
  };
}

/**
 * محضر هالك مبسّط: نوع المنتج، اللون، نوع الخدمة، والعدد فقط.
 *
 * التكلفة تُحسب تلقائياً من تكلفة قطعة المنتج × العدد (لا يدخلها المستخدم)،
 * والسبب يُبنى من اللون والخدمة فيبقى السجل مُفسَّراً بلا حقول زائدة.
 */
export async function createDamage(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('damage.write');
  const parsed = Schema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true, nameAr: true, cost: true },
  });
  if (!product) return { fieldErrors: { productId: 'المنتج غير موجود.' } };

  // اللون (اختياري) — نتحقّق أنه لهذا المستأجر ونأخذ اسمه للسبب.
  let colorName: string | null = null;
  if (parsed.data.colorId) {
    const color = await prisma.color.findFirst({
      where: { id: parsed.data.colorId, tenantId: user.tenantId, isDeleted: false },
      select: { nameAr: true },
    });
    colorName = color?.nameAr ?? null;
  }
  const serviceName = parsed.data.service && isPriceService(parsed.data.service)
    ? PRICE_SERVICE_AR[parsed.data.service]
    : null;

  // السبب من اللون والخدمة — يبقى مُفسَّراً بلا حقل سبب منفصل.
  const reason = [colorName, serviceName].filter(Boolean).join(' · ') || product.nameAr;

  // التكلفة: يدوية إن كُتبت، وإلا تلقائياً = تكلفة قطعة المنتج × العدد.
  const total =
    parsed.data.manualCost !== undefined
      ? damageTotal(dec(parsed.data.manualCost), 0)
      : damageTotal((product.cost ? dec(product.cost) : dec(0)).times(dec(parsed.data.quantity)), 0);

  const damage = await prisma.damageRecord.create({
    data: {
      tenantId: user.tenantId,
      number: await nextOpsNumber('damageRecord', 'DMG', user.tenantId),
      damageDate: new Date(),
      productId: product.id,
      productLabel: [product.nameAr, colorName].filter(Boolean).join(' · '),
      quantity: parsed.data.quantity,
      reason,
      materialCost: total.toString(),
      laborCost: '0',
      totalCost: total.toString(),
      status: 'DRAFT',
      createdById: user.id,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'damage.create',
    entityType: 'DamageRecord',
    entityId: damage.id,
    detail: `${damage.number} ${total.toString()}`,
  });

  revalidatePath('/damage');
  redirect(`/damage/${damage.id}`);
}

export async function setDamageStatus(id: string, next: string): Promise<void> {
  const user = await requirePermission('damage.view');
  if (!isDamageStatus(next)) return;

  const damage = await prisma.damageRecord.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!damage || !isDamageStatus(damage.status)) return;
  if (!DAMAGE_TRANSITIONS[damage.status].includes(next)) return;

  // Submitting is an author's act; deciding is an approver's.
  if (next === 'PENDING') await requirePermission('damage.write');
  else await requirePermission('damage.approve');

  if (next === 'APPROVED' && damage.createdById === user.id) {
    redirect(`/damage/${id}?err=self`);
  }

  await prisma.damageRecord.update({
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
    action: 'damage.status',
    entityType: 'DamageRecord',
    entityId: id,
    detail: `${damage.number} ${damage.status} -> ${next}`,
  });

  revalidatePath('/damage');
  revalidatePath(`/damage/${id}`);
}

export async function deleteDamage(id: string): Promise<void> {
  const user = await requirePermission('damage.write');
  const damage = await prisma.damageRecord.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { _count: { select: { penalties: true } } },
  });
  if (!damage) redirect('/damage');
  if (damage.status === 'APPROVED') redirect(`/damage/${id}?err=approved`);
  // A penalty answers for this record. Removing the record would leave the
  // deduction standing with nothing behind it.
  if (damage._count.penalties > 0) redirect(`/damage/${id}?err=penalties`);

  await prisma.damageRecord.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'damage.softDelete',
    entityType: 'DamageRecord',
    entityId: id,
    detail: damage.number,
  });

  revalidatePath('/damage');
  redirect('/damage');
}

// ── Penalties ───────────────────────────────────────────────

const PenaltySchema = z.object({
  employeeId: z.string().min(1, 'الموظف مطلوب.'),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر.'),
  reason: z.string().trim().min(5, 'سبب الجزاء مطلوب.').max(1000),
});

export async function createPenalty(
  damageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('damage.write');
  const parsed = PenaltySchema.safeParse({
    employeeId: String(formData.get('employeeId') ?? ''),
    amount: String(formData.get('amount') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const damage = await prisma.damageRecord.findFirst({
    where: { id: damageId, tenantId: user.tenantId, isDeleted: false },
  });
  if (!damage) return { error: 'محضر الهالك غير موجود.' };

  // A penalty larger than the damage it answers for is not a recovery, it is
  // a punishment the system should refuse to compute.
  if (penaltyExceedsDamage(parsed.data.amount, damage.totalCost)) {
    return {
      fieldErrors: {
        amount: `الجزاء لا يتجاوز تكلفة الهالك (${damage.totalCost.toString()} د.ع).`,
      },
    };
  }

  const employee = await prisma.user.findFirst({
    where: { id: parsed.data.employeeId, tenantId: user.tenantId },
  });
  if (!employee) return { fieldErrors: { employeeId: 'الموظف غير موجود.' } };

  const penalty = await prisma.penalty.create({
    data: {
      tenantId: user.tenantId,
      number: await nextOpsNumber('penalty', 'PEN', user.tenantId),
      damageId,
      employeeId: parsed.data.employeeId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      status: 'PENDING',
      createdById: user.id,
      events: { create: { toStatus: 'PENDING', note: 'إنشاء الجزاء', userId: user.id } },
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'penalty.create',
    entityType: 'Penalty',
    entityId: penalty.id,
    detail: `${penalty.number} ${parsed.data.amount} on ${damage.number}`,
  });

  revalidatePath(`/damage/${damageId}`);
  return { ok: `تم تسجيل الجزاء ${penalty.number} بانتظار الاعتماد.` };
}

export async function setPenaltyStatus(
  damageId: string,
  penaltyId: string,
  next: string,
): Promise<void> {
  const user = await requirePermission('penalties.approve');
  if (!isPenaltyStatus(next)) return;

  const penalty = await prisma.penalty.findFirst({
    where: { id: penaltyId, tenantId: user.tenantId },
  });
  if (!penalty || !isPenaltyStatus(penalty.status)) return;
  if (!PENALTY_TRANSITIONS[penalty.status].includes(next)) return;

  if (next === 'APPROVED' && penalty.createdById === user.id) {
    redirect(`/damage/${damageId}?err=self-penalty`);
  }

  await tenantTransaction(async (tx) => {
    await tx.penalty.update({
      where: { id: penaltyId },
      data: {
        status: next,
        approvedById: next === 'APPROVED' ? user.id : penalty.approvedById,
        approvedAt: next === 'APPROVED' ? new Date() : penalty.approvedAt,
        paidAt: next === 'PAID' ? new Date() : penalty.paidAt,
      },
    });
    // Append-only history. The penalty row says what is true now; this says
    // how it got there and who decided.
    await tx.penaltyEvent.create({
      data: {
        penaltyId,
        fromStatus: penalty.status,
        toStatus: next,
        userId: user.id,
      },
    });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'penalty.status',
    entityType: 'Penalty',
    entityId: penaltyId,
    detail: `${penalty.number} ${penalty.status} -> ${next}`,
  });

  revalidatePath(`/damage/${damageId}`);
}
