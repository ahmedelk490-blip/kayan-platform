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
  piecePrice,
  damageCharge,
  dec,
  formatMoney,
  isOwnerRole,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { nextOpsNumber, type FormState } from '@/lib/ops';
import { numeric, normalizeDigits } from '@/lib/num';
import { adjustStock } from '@/lib/stock';
import {
  hasStarted,
  installmentNote,
  monthStartInstant,
  planMonth,
  planNote,
  planStart,
} from '@/lib/penalty';

// ── Damage records ──────────────────────────────────────────

const Schema = z.object({
  productId: z.string().trim().min(1, 'اختر المنتج.'),
  colorId: z.string().trim().optional().or(z.literal('')),
  service: z.string().trim().optional().or(z.literal('')),
  quantity: numeric(z.coerce.number().positive('العدد يجب أن يكون أكبر من صفر.')),
  manualCost: numeric(z.coerce.number().nonnegative('التكلفة لا تكون سالبة.').optional()),
  /** الموظف المتسبب (اختياري) — عند اعتماد الهالك يُنشأ له جزاء بقيمة التكلفة. */
  employeeId: z.string().trim().optional().or(z.literal('')),
  /** سبب حرّ يكتبه المسجِّل — يتصدّر سبب السجل. */
  reasonNote: z.string().trim().max(500).optional().or(z.literal('')),
  /** المتغيّر المحلول (منتج×لون×مقاس) — عند الاعتماد تُخصم قطعه من المخزون. */
  variantId: z.string().trim().optional().or(z.literal('')),
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
    employeeId: String(formData.get('employeeId') ?? ''),
    reasonNote: String(formData.get('reasonNote') ?? ''),
    variantId: String(formData.get('variantId') ?? ''),
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

  // الموظف المتسبب (اختياري) — يُتحقّق أنه من نفس المستأجر، ويُخزَّن على
  // المحضر؛ الجزاء يُنشأ عند الاعتماد لا الآن (المحضر قد يُرفض).
  let employeeId: string | null = null;
  if (parsed.data.employeeId) {
    const employee = await prisma.user.findFirst({
      where: { id: parsed.data.employeeId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!employee) return { fieldErrors: { employeeId: 'الموظف غير موجود.' } };
    employeeId = employee.id;
  }

  // المتغيّر المحلول (اختياري) — يُتحقّق أنه لهذا المنتج ولهذا المستأجر.
  let variantId: string | null = null;
  if (parsed.data.variantId) {
    const variant = await prisma.productVariant.findFirst({
      where: {
        id: parsed.data.variantId,
        productId: product.id,
        product: { tenantId: user.tenantId },
      },
      select: { id: true },
    });
    variantId = variant?.id ?? null;
  }

  // السبب: النص الحرّ أولاً إن كُتب، ثم اللون والخدمة — يبقى مُفسَّراً.
  const reason =
    [parsed.data.reasonNote || null, colorName, serviceName].filter(Boolean).join(' · ') ||
    product.nameAr;

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
      employeeId,
      productId: product.id,
      variantId,
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

/**
 * ما يُحمَّل على الموظف مقابل محضر هالك — بسعر بيع القطعة × العدد.
 *
 * السعر من بطاقة المنتج (سعر القطعة، وإلا سعر الدستة ÷ قطعها). وإن لم يُعرف
 * سعرٌ عادت القيمة إلى التكلفة المسجَّلة في المحضر، فلا يسقط الجزاء لجهل.
 */
async function damageChargeFor(
  tenantId: string,
  damage: { productId: string | null; quantity: unknown; totalCost: unknown },
) {
  const product = damage.productId
    ? await prisma.product.findFirst({
        where: { id: damage.productId, tenantId },
        select: { sellingPrice: true, dozenPrice: true, piecesPerDozen: true },
      })
    : null;
  return damageCharge(
    damage.quantity as never,
    product ? piecePrice(product) : null,
    damage.totalCost as never,
  );
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

  // المنع الصحيح: المتَّهم لا يعتمد محضره.
  //
  // كان المنع على *كاتب* المحضر — وهو خطأ: محضر الهالك يُحمِّل موظفاً آخر،
  // فكاتبه لا ينتفع باعتماده. والنتيجة أن المالك (وهو الكاتب والمعتمد الوحيد)
  // لم يستطع اعتماد محضرٍ قط، فبقي معلّقاً ولم يُولَد جزاء ولم يُخصم شيء.
  if (next === 'APPROVED' && damage.employeeId && damage.employeeId === user.id) {
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

  // اعتمادُ الهالك يخصم قطعه التالفة من المخزون تلقائياً — القطعة التالفة
  // خرجت من الرصيد واقعاً، فيخرج رقمها معها. يشترط متغيّراً محلولاً
  // (منتج×لون×مقاس)، ولا يتكرر لو أُعيد الاعتماد (يُفحص بمرجع رقم المحضر).
  if (next === 'APPROVED' && damage.variantId && damage.productId) {
    const already = await prisma.stockMovement.findFirst({
      where: { tenantId: user.tenantId, reference: damage.number, type: 'ISSUE' },
      select: { id: true },
    });
    const warehouse = already
      ? null
      : await prisma.warehouse.findFirst({
          where: { tenantId: user.tenantId, isDeleted: false },
          orderBy: { code: 'asc' },
          select: { id: true },
        });
    if (warehouse) {
      await tenantTransaction(async (tx) => {
        await tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId: damage.productId!,
            variantId: damage.variantId!,
            warehouseId: warehouse.id,
            type: 'ISSUE',
            quantity: dec(damage.quantity).negated().toString(),
            reference: damage.number,
            reason: `هالك معتمد — ${damage.reason}`,
            userId: user.id,
          },
        });
        await adjustStock(tx, damage.variantId!, warehouse.id, dec(damage.quantity).negated());
      });
      revalidatePath('/inventory');
    }
  }

  // اعتمادُ هالكٍ له موظف متسبب يولّد جزاءً تلقائياً **بسعر بيع القطعة** لا
  // بسعر الجملة (بطلب المالك): القطعة التالفة حرمت الشركة من بيعها لا من
  // ثمن شرائها فحسب. وإن جُهل سعر البيع عاد الأساس للتكلفة المسجَّلة.
  // الجزاء يبدأ بانتظار الاعتماد فيمرّ بدورته ثم يُخصم من راتب الموظف.
  // لا يتكرر لو أُعيد الاعتماد.
  if (next === 'APPROVED' && damage.employeeId) {
    const existing = await prisma.penalty.findFirst({
      where: { tenantId: user.tenantId, damageId: id },
      select: { id: true },
    });
    if (!existing) {
      const charged = await damageChargeFor(user.tenantId, damage);
      const penalty = await prisma.penalty.create({
        data: {
          tenantId: user.tenantId,
          number: await nextOpsNumber('penalty', 'PEN', user.tenantId),
          damageId: id,
          employeeId: damage.employeeId,
          amount: charged.toString(),
          reason: `هالك ${damage.number} — ${damage.reason}`,
          status: 'PENDING',
          createdById: user.id,
          events: { create: { toStatus: 'PENDING', note: 'جزاء تلقائي من اعتماد الهالك', userId: user.id } },
        },
      });
      await audit({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'penalty.create',
        entityType: 'Penalty',
        entityId: penalty.id,
        detail: `${penalty.number} تلقائي من ${damage.number}`,
      });
    }
  }

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
  amount: numeric(z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر.')),
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
  // السقف بقيمة ما فُقد بسعر البيع لا بسعر الجملة — وإلا رفض النظامُ جزاءً
  // يساوي الخسارة الحقيقية لأنه «أكبر من التكلفة».
  const maxCharge = await damageChargeFor(user.tenantId, damage);
  if (penaltyExceedsDamage(parsed.data.amount, maxCharge)) {
    return {
      fieldErrors: {
        amount: `الجزاء لا يتجاوز قيمة الهالك بسعر البيع (${maxCharge.toString()} د.ع).`,
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

/**
 * خطّة تقسيط الجزاء — عدد الأقساط الشهرية.
 *
 * جزاءٌ يعادل راتب شهر يُستقطع دفعةً واحدة يترك الموظّف بلا شيء ذلك
 * الشهر، وهذا ليس ما أراده من اعتمده. فالخطّة تُعدّل ما دام الجزاء لم
 * يُستوفَ بعد — المبلغ لا يُمسّ (هو قرارٌ اعتُمد)، وإنما وتيرة قبضه.
 */
export async function setPenaltyPlan(
  damageId: string,
  penaltyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('penalties.approve');

  const count = Number(normalizeDigits(String(formData.get('installments') ?? '')));
  if (!Number.isInteger(count) || count < 1 || count > 36) {
    return { fieldErrors: { installments: 'عدد الأقساط بين ١ و٣٦.' } };
  }

  const penalty = await prisma.penalty.findFirst({
    where: { id: penaltyId, tenantId: user.tenantId },
    select: { id: true, number: true, status: true },
  });
  if (!penalty) return { error: 'الجزاء غير موجود.' };
  if (penalty.status === 'PAID' || penalty.status === 'CANCELLED') {
    return { error: 'جزاءٌ مُستوفٍ أو ملغٍ لا تُعدّل خطّته.' };
  }

  await prisma.penalty.update({ where: { id: penaltyId }, data: { installments: count } });

  // متى يبدأ الاستقطاع: هذا الشهر أو الذي بعده (بطلب المالك). يُقيَّد في سجلّ
  // الجزاء لا في عمودٍ جديد (انظر lib/penalty)، والاستقطاع قبله يُرفَض.
  const start = planMonth(String(formData.get('start') ?? '') === 'next' ? 'next' : 'this');
  const startLabel = `${start.month}/${start.year}`;
  await prisma.penaltyEvent.create({
    data: {
      penaltyId,
      fromStatus: penalty.status,
      toStatus: penalty.status,
      note: planNote(count, start),
      userId: user.id,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'penalty.plan',
    entityType: 'Penalty',
    entityId: penaltyId,
    detail: `${penalty.number} — ${count} قسط`,
  });

  revalidatePath(`/damage/${damageId}`);
  return { ok: `${count} قسط — يبدأ شهر ${startLabel}.` };
}

/**
 * استقطاع قسطٍ من جزاء معتمد.
 *
 * الجزاء المعتمد خطّةٌ لا مالٌ تحرّك: المال يخرج بصفّ خصمٍ على الموظّف
 * يظهر في كشفه كبقية الحركات. وآخر قسط يأخذ الباقي كلّه ويغلق الجزاء،
 * فلا يبقى منه كسرٌ معلّق من القسمة.
 */
type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

type Taken =
  | { result: 'ok'; employeeId: string; settled: boolean }
  | { result: 'not-due' | 'already-month' | 'none'; employeeId?: string };

/**
 * قسطٌ واحد داخل معاملة.
 *
 * يرفض ما لم يحلّ شهر بدايته، ويرفض قسطاً ثانياً في الشهر نفسه: ضغطتان على
 * «استقطع» كانتا تأخذان قسطين من راتب شهرٍ واحد. والقسط من المبلغ مقسوماً
 * على عدد الأقساط، وآخرها يأخذ الباقي كلّه فلا يبقى كسرٌ معلّق.
 */
async function takeInstallment(
  tx: Tx,
  user: { tenantId: string; id: string },
  penaltyId: string,
): Promise<Taken> {
  const penalty = await tx.penalty.findFirst({
    where: { id: penaltyId, tenantId: user.tenantId, status: 'APPROVED' },
    select: {
      number: true,
      employeeId: true,
      amount: true,
      installments: true,
      collectedAmount: true,
      events: { orderBy: { createdAt: 'asc' }, select: { note: true } },
    },
  });
  if (!penalty) return { result: 'none' };

  const total = dec(penalty.amount);
  const collected = dec(penalty.collectedAmount);
  const remaining = total.minus(collected);
  if (remaining.lte(0)) return { result: 'none', employeeId: penalty.employeeId };
  if (!hasStarted(planStart(penalty.events.map((e) => e.note)))) {
    return { result: 'not-due', employeeId: penalty.employeeId };
  }

  const note = installmentNote(penalty.number);
  const thisMonth = await tx.employeePayment.count({
    where: {
      tenantId: user.tenantId,
      employeeId: penalty.employeeId,
      isDeleted: false,
      note,
      paidAt: { gte: monthStartInstant() },
    },
  });
  if (thisMonth > 0) return { result: 'already-month', employeeId: penalty.employeeId };

  // القسط بالدينار الكامل (لا كسور — بطلب المالك)، وآخر قسطٍ في الخطّة يأخذ
  // الباقي كلّه: ١٠٬٠٠٠ على ثلاثة = ٣٬٣٣٣ و٣٬٣٣٣ و٣٬٣٣٤، لا قسطاً رابعاً بدينار.
  const per = total.dividedBy(Math.max(1, penalty.installments)).floor();
  const takenBefore = await tx.employeePayment.count({
    where: { tenantId: user.tenantId, employeeId: penalty.employeeId, isDeleted: false, note },
  });
  const last = takenBefore + 1 >= penalty.installments;
  const take = last || per.lte(0) || per.gte(remaining) ? remaining : per;

  await tx.employeePayment.create({
    data: {
      tenantId: user.tenantId,
      // نفس بادئة دفعات الموظّفين فلا يتصادم رقمان من مولّدين.
      number: await nextOpsNumber('employeePayment', 'EP', user.tenantId, tx),
      employeeId: penalty.employeeId,
      kind: 'DEDUCTION',
      amount: take.toString(),
      paidAt: new Date(),
      note,
      createdById: user.id,
    },
  });

  const after = collected.plus(take);
  const settled = after.gte(total);
  await tx.penalty.update({
    where: { id: penaltyId },
    data: {
      collectedAmount: after.toString(),
      ...(settled ? { status: 'PAID', paidAt: new Date() } : {}),
    },
  });
  if (settled) {
    await tx.penaltyEvent.create({
      data: { penaltyId, fromStatus: 'APPROVED', toStatus: 'PAID', userId: user.id },
    });
  }
  return { result: 'ok', employeeId: penalty.employeeId, settled };
}

/** مسار الرجوع مقبولٌ داخل النظام وحده — لا رابطاً خارجياً مُمرَّراً. */
function safeBack(back: string): string {
  return back.startsWith('/') && !back.startsWith('//') ? back : '/hr';
}

/** زرّ «استقطع قسطاً» — من شاشة الهالك أو من كشف الموظّف. */
export async function collectPenaltyInstallment(back: string, penaltyId: string): Promise<void> {
  const user = await requirePermission('penalties.approve');
  const target = safeBack(back);

  const taken = await tenantTransaction((tx) => takeInstallment(tx, user, penaltyId));

  if (taken.result === 'ok') {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'penalty.installment',
      entityType: 'Penalty',
      entityId: penaltyId,
      detail: taken.settled ? 'قسط مستقطَع — استُوفي الجزاء' : 'قسط مستقطَع',
    });
  }

  revalidatePath(target);
  revalidatePath('/hr');
  if (taken.employeeId) revalidatePath(`/hr/${taken.employeeId}`);
  if (taken.result === 'not-due' || taken.result === 'already-month') {
    redirect(`${target.split('?')[0]}?err=${taken.result}`);
  }
}

const DeductionSchema = z.object({
  employeeId: z.string().min(1, 'اختر الموظف.'),
  amount: numeric(
    z.coerce
      .number()
      .positive('المبلغ يجب أن يكون أكبر من صفر.')
      .max(10_000_000_000, 'المبلغ غير منطقي — تأكد أنك لم تلصق رقماً خاطئاً.'),
  ),
  installments: numeric(
    z.coerce.number().int('عدد صحيح.').min(1, 'قسط واحد على الأقل.').max(36, 'الحدّ ٣٦ قسطاً.'),
  ),
  start: z.enum(['this', 'next']).catch('this'),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
  returnId: z.string().optional().or(z.literal('')),
});

/**
 * خصمٌ على موظّف يقرّره المدير — مقسّطاً، يبدأ هذا الشهر أو الذي بعده.
 *
 * الخصم كان دفعةً واحدة من شاشة الرواتب، والتقسيط للهالك وحده. والمالك يريد
 * الشيء نفسه للمرتجع ولأيّ خطأٍ آخر: مبلغٌ يقرّره، يُقسَّط على أشهر، ويبدأ
 * متى شاء. فهو جزاءٌ بلا محضر هالك، يعيش بالآلية نفسها: خطّةٌ في سجلّه،
 * وقسطٌ يُستقطع بصفّ خصمٍ في كشف الموظّف.
 *
 * ويولد معتمَداً: من قرّره هو صاحب الاعتماد. وإن بدأ هذا الشهر استُقطع أوّل
 * قسطٍ فوراً — «من هذا الشهر» تعني أن راتب هذا الشهر يحمله.
 *
 * وخصم المرتجع لا يتجاوز قيمة المرتجع، ويُكتب رقمه في سببه.
 */
export async function createDeduction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('penalties.approve');
  const parsed = DeductionSchema.safeParse({
    employeeId: String(formData.get('employeeId') ?? ''),
    amount: String(formData.get('amount') ?? ''),
    installments: String(formData.get('installments') ?? '1'),
    start: String(formData.get('start') ?? 'this'),
    reason: String(formData.get('reason') ?? ''),
    returnId: String(formData.get('returnId') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const employee = await prisma.user.findFirst({
    where: { id: d.employeeId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!employee) return { fieldErrors: { employeeId: 'الموظف غير موجود.' } };

  let reason = d.reason ?? '';
  let returnPath: string | null = null;
  if (d.returnId) {
    const ret = await prisma.salesReturn.findFirst({
      where: { id: d.returnId, tenantId: user.tenantId, isDeleted: false },
      select: { id: true, number: true, totalAmount: true },
    });
    if (!ret) return { error: 'المرتجع غير موجود.' };
    if (dec(d.amount).gt(dec(ret.totalAmount))) {
      return {
        fieldErrors: { amount: `الخصم لا يتجاوز قيمة المرتجع (${formatMoney(ret.totalAmount)}).` },
      };
    }
    reason = `مرتجع ${ret.number}${reason ? ` — ${reason}` : ''}`;
    returnPath = `/returns/${ret.id}`;
  }
  if (reason.length < 3) return { fieldErrors: { reason: 'اكتب سبب الخصم.' } };

  const start = planMonth(d.start);
  const created = await tenantTransaction(async (tx) => {
    const number = await nextOpsNumber('penalty', 'PEN', user.tenantId, tx);
    const penalty = await tx.penalty.create({
      data: {
        tenantId: user.tenantId,
        number,
        employeeId: d.employeeId,
        amount: d.amount,
        reason,
        installments: d.installments,
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        createdById: user.id,
      },
    });
    await tx.penaltyEvent.create({
      data: {
        penaltyId: penalty.id,
        toStatus: 'APPROVED',
        note: 'خصمٌ قرّره المدير مباشرة',
        userId: user.id,
      },
    });
    await tx.penaltyEvent.create({
      data: {
        penaltyId: penalty.id,
        fromStatus: 'APPROVED',
        toStatus: 'APPROVED',
        note: planNote(d.installments, start),
        userId: user.id,
      },
    });
    const first = d.start === 'this' ? await takeInstallment(tx, user, penalty.id) : null;
    return { id: penalty.id, number, firstTaken: first?.result === 'ok' };
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'penalty.deduction',
    entityType: 'Penalty',
    entityId: created.id,
    detail: `${created.number} — ${formatMoney(d.amount)} على ${d.installments} قسط — ${reason}`,
  });

  revalidatePath('/hr');
  revalidatePath(`/hr/${d.employeeId}`);
  if (returnPath) revalidatePath(returnPath);

  const per = dec(d.amount).dividedBy(d.installments).floor();
  return {
    ok: [
      `سُجّل الخصم ${created.number}: ${d.installments} قسط، القسط ${formatMoney(per)}.`,
      created.firstTaken
        ? 'استُقطع قسط هذا الشهر.'
        : `يبدأ الاستقطاع شهر ${start.month}/${start.year}.`,
    ].join(' '),
  };
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

  // صاحب القرار يعتمد ما سجّله: لا أحد فوقه يعتمد له (انظر isOwnerRole).
  if (next === 'APPROVED' && penalty.createdById === user.id && !isOwnerRole(user.role)) {
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
