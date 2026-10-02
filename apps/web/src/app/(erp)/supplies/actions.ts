'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dec, isSupplyKind, isSupplyTxType, supplyDelta, movingAverageCost, SUPPLY_CATEGORIES } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { numeric } from '@/lib/num';
import { parseDateOr, nextOpsNumber, type FormState } from '@/lib/ops';
import { supplyExpenseData, unpostedSupplyPurchases, withPerPiece } from '@/lib/supplies';

const SupplySchema = z
  .object({
    nameAr: z.string().trim().min(2, 'الاسم مطلوب.').max(120),
    kind: z.string().refine(isSupplyKind, 'نوع غير معروف.'),
    category: z.string().min(1, 'الفئة مطلوبة.'),
    unit: z.string().trim().max(24).optional().or(z.literal('')),
    minStock: numeric(z.coerce.number().min(0).optional()),
    // استهلاك القطعة — للحساب وحده (انظر perPieceOf)، اختياري.
    perPiece: numeric(z.coerce.number().min(0, 'قيمة غير صالحة.').optional()),
  })
  // A thread is not a printing supply. Validating the pair, not each field
  // alone, is what stops the two lists quietly merging.
  .refine((v) => SUPPLY_CATEGORIES[v.kind as 'PRINTING' | 'EMBROIDERY'].includes(v.category), {
    message: 'هذه الفئة لا تخص هذا النوع.',
    path: ['category'],
  });

async function nextSupplyCode(tenantId: string, kind: string): Promise<string> {
  const prefix = kind === 'PRINTING' ? 'SUP-P-' : 'SUP-E-';
  const rows = await prisma.supply.findMany({
    where: { tenantId, code: { startsWith: prefix } },
    select: { code: true },
  });
  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.code.slice(prefix.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export async function createSupply(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('supplies.write');
  const parsed = SupplySchema.safeParse({
    nameAr: String(formData.get('nameAr') ?? ''),
    kind: String(formData.get('kind') ?? ''),
    category: String(formData.get('category') ?? ''),
    unit: String(formData.get('unit') ?? ''),
    minStock: String(formData.get('minStock') ?? '0'),
    perPiece: String(formData.get('perPiece') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supply = await prisma.supply.create({
    data: {
      tenantId: user.tenantId,
      code: await nextSupplyCode(user.tenantId, parsed.data.kind),
      nameAr: parsed.data.nameAr,
      kind: parsed.data.kind,
      category: parsed.data.category,
      unit: parsed.data.unit || null,
      minStock: parsed.data.minStock ?? 0,
      notes: withPerPiece(null, parsed.data.perPiece),
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supply.create',
    entityType: 'Supply',
    entityId: supply.id,
    detail: `${supply.code} ${supply.nameAr}`,
  });

  revalidatePath('/supplies');
  return { ok: `تم إنشاء ${supply.code}.` };
}

/**
 * تعديل مستلزم: الاسم والوحدة والحد الأدنى وفئته.
 *
 * النوع والفئة يبقيان قابلين للتعديل مع نفس قيد الزوج — لكن الرصيد لا
 * يُعدَّل من هنا: الرصيد حصيلة حركات، يُغيَّر بحركة شراء أو استهلاك أو تسوية
 * لا بتحرير حقل، وإلا انفصل عن سجلّه.
 */
export async function updateSupply(
  supplyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('supplies.write');

  const parsed = SupplySchema.safeParse({
    nameAr: String(formData.get('nameAr') ?? ''),
    kind: String(formData.get('kind') ?? ''),
    category: String(formData.get('category') ?? ''),
    unit: String(formData.get('unit') ?? ''),
    minStock: String(formData.get('minStock') ?? '0'),
    perPiece: String(formData.get('perPiece') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const current = await prisma.supply.findFirst({
    where: { id: supplyId, tenantId: user.tenantId, isDeleted: false },
    select: { notes: true },
  });
  if (!current) return { error: 'المستلزم غير موجود.' };

  await prisma.supply.updateMany({
    where: { id: supplyId, tenantId: user.tenantId, isDeleted: false },
    data: {
      nameAr: parsed.data.nameAr,
      kind: parsed.data.kind,
      category: parsed.data.category,
      unit: parsed.data.unit || null,
      minStock: parsed.data.minStock ?? 0,
      notes: withPerPiece(current.notes, parsed.data.perPiece),
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supply.update',
    entityType: 'Supply',
    entityId: supplyId,
    detail: parsed.data.nameAr,
  });

  revalidatePath('/supplies');
  revalidatePath('/inventory');
  return { ok: 'حُفظ التعديل.' };
}

/**
 * حذف مستلزم — حذف ناعم.
 *
 * المستلزم قد تشير إليه حركات شراء واستهلاك؛ حذفه الفعليّ يفقد تاريخه.
 * يُخفى بـ isDeleted فيختفي من الشاشات ويبقى سجلّه سليماً.
 */
export async function deleteSupply(supplyId: string): Promise<void> {
  const user = await requirePermission('supplies.write');

  const supply = await prisma.supply.findFirst({
    where: { id: supplyId, tenantId: user.tenantId, isDeleted: false },
    select: { code: true, nameAr: true },
  });
  if (!supply) return;

  await prisma.supply.updateMany({
    where: { id: supplyId, tenantId: user.tenantId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supply.delete',
    entityType: 'Supply',
    entityId: supplyId,
    detail: `${supply.code} ${supply.nameAr}`,
  });

  revalidatePath('/supplies');
  revalidatePath('/inventory');
}

const TxSchema = z.object({
  supplyId: z.string().min(1, 'اختر المستلزم.'),
  type: z.string().refine(isSupplyTxType, 'نوع حركة غير معروف.'),
  txDate: z.string().optional(),
  quantity: numeric(z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر.')),
  unitCost: numeric(z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.')),
  productionOrderId: z.string().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

/**
 * Record a purchase or a consumption.
 *
 * The ledger is append-only; `Supply.onHand` is a projection kept in step
 * inside the same transaction. Monthly spend and monthly burn are then two
 * queries over one truth rather than two tables that can disagree.
 */
export async function recordSupplyTransaction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('supplies.write');
  const parsed = TxSchema.safeParse({
    supplyId: String(formData.get('supplyId') ?? ''),
    type: String(formData.get('type') ?? ''),
    txDate: String(formData.get('txDate') ?? ''),
    quantity: String(formData.get('quantity') ?? ''),
    unitCost: String(formData.get('unitCost') ?? '0'),
    productionOrderId: String(formData.get('productionOrderId') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supply = await prisma.supply.findFirst({
    where: { id: parsed.data.supplyId, tenantId: user.tenantId, isDeleted: false },
  });
  if (!supply) return { error: 'المستلزم غير موجود.' };

  if (parsed.data.productionOrderId) {
    const order = await prisma.productionOrder.findFirst({
      where: { id: parsed.data.productionOrderId, tenantId: user.tenantId, isDeleted: false },
    });
    if (!order) return { fieldErrors: { productionOrderId: 'أمر الإنتاج غير موجود.' } };
  }

  const quantity = dec(parsed.data.quantity);
  // استهلاكٌ بلا تكلفةٍ مكتوبة يُقيَّم بمتوسّط تكلفة المستلزم لا بصفر.
  //
  // من يسجّل استهلاك ثلاث علب حبرٍ يعرف العدد ولا يحفظ سعر العلبة، فيترك
  // الخانة على صفرها — فكان الاستهلاك يُقيَّد بلا قيمة، و«استهلاك محمَّل»
  // يبقى صفراً مهما احترق في الإنتاج. والمتوسّط المرجّح هو ما دُفع فعلاً في
  // ما على الرفّ؛ وإن لم يُحسب بعد فآخر سعر شراء.
  //
  // والشراء بلا سعرٍ مكتوب يُحسب بآخر سعر شراء: أمين المخزن يعدّ ولا يُسأل عن
  // الأسعار (قاعدة المالك)، ومبلغ الشراء لا بد أن يُقيَّد في المصروفات. وأول
  // شراءٍ لمستلزمٍ لم يُعرف سعره بعد يُطلب سعره — مالٌ خرج لا يُقيَّد بصفر.
  const typedCost = dec(parsed.data.unitCost);
  const avg = dec(supply.avgCost);
  const last = dec(supply.lastUnitCost ?? 0);
  const unitCost = typedCost.gt(0)
    ? typedCost
    : parsed.data.type === 'CONSUMPTION'
      ? avg.gt(0) ? avg : last
      : last.gt(0) ? last : avg;
  const isPurchase = parsed.data.type === 'PURCHASE';
  if (isPurchase && unitCost.lte(0)) {
    return {
      fieldErrors: { unitCost: 'أول شراءٍ لهذا المستلزم — اكتب سعر الوحدة ليُحسب في المصروفات.' },
    };
  }
  const totalCost = quantity.times(unitCost);
  const delta = supplyDelta(parsed.data.type as 'PURCHASE' | 'CONSUMPTION', quantity);

  // الاستهلاك لا يُنزل الرصيد تحت الصفر — كما يمنعه مخزون المنتجات تماماً.
  // كتابة ٥٠ استهلاكاً على رصيد ٥ كانت تترك «−٤٥» يُقرأ نفاداً بعجزٍ وهمي
  // ويُقيَّم بالسالب في تقرير المخزون.
  if (delta.isNegative() && dec(supply.onHand).plus(delta).isNegative()) {
    return {
      fieldErrors: {
        quantity: `الرصيد الحالي ${supply.onHand.toString()} ${supply.unit ?? ''} لا يكفي لهذا الاستهلاك.`,
      },
    };
  }

  const txDate = parseDateOr(parsed.data.txDate);
  // رقم المصروف قبل المعاملة: يقرأ أرقام السنة ليعطي التالي، كأجرة التوصيل.
  const expenseNumber = isPurchase ? await nextOpsNumber('secondaryExpense', 'EXP', user.tenantId) : null;

  await tenantTransaction(async (tx) => {
    const created = await tx.supplyTransaction.create({
      data: {
        tenantId: user.tenantId,
        supplyId: supply.id,
        type: parsed.data.type,
        txDate,
        quantity: quantity.toString(),
        unitCost: unitCost.toString(),
        totalCost: totalCost.toString(),
        productionOrderId: parsed.data.productionOrderId || null,
        notes: parsed.data.notes || null,
        userId: user.id,
      },
    });

    // الشراء يُحدِّث المتوسط المرجّح كما يفعل استلام المشتريات تماماً: كان
    // يُحدِّث آخر سعرٍ وحده ويترك avgCost صفراً، فيأتي أول استلامٍ لاحق
    // فيجد متوسطاً صفراً ويعتمد سعره هو على كل الرصيد — تقييمٌ مضخَّم.
    // (وسعر الشراء فوق الصفر دائماً الآن — رُدَّ ما دونه أعلاه.)
    await tx.supply.update({
      where: { id: supply.id },
      data: {
        onHand: { increment: delta.toNumber() },
        ...(isPurchase
          ? {
              lastUnitCost: unitCost.toString(),
              avgCost: movingAverageCost(
                supply.onHand,
                supply.avgCost,
                quantity,
                unitCost,
              ).toString(),
            }
          : {}),
      },
    });

    // في المعاملة نفسها: شراءٌ بلا مصروفه أو مصروفٌ بلا شرائه لا يقعان.
    if (expenseNumber) {
      await tx.secondaryExpense.create({
        data: supplyExpenseData(user, expenseNumber, { id: created.id, txDate, quantity, totalCost }, supply),
      });
    }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supply.transaction',
    entityType: 'Supply',
    entityId: supply.id,
    detail: `${parsed.data.type} ${quantity.toString()} ${supply.code}`,
  });

  revalidatePath('/supplies');
  if (isPurchase) revalidatePath('/expenses');
  return {
    ok: isPurchase
      ? `تم تسجيل الشراء وقُيِّد مبلغه في المصروفات${typedCost.gt(0) ? '' : ' بآخر سعر شراء معروف'}.`
      : 'تم تسجيل الحركة.',
  };
}

/**
 * حساب مشتريات المستلزمات السابقة في المصروفات — بضغطة من المالك.
 *
 * ما سُجّل قبل ربط الشراء بالمصروفات بقي خارج الربح. ولا يُقيَّد وحده: لعلّ
 * المالك سجّله بيده في المصروفات يومها، فالتقييد الآلي يكرّره. فيُعرض عليه
 * بعدده ومبلغه ويقرّر هو.
 */
export async function postPastSupplyPurchases(): Promise<void> {
  const user = await requirePermission('expenses.approve');
  const pending = await unpostedSupplyPurchases(user.tenantId);
  if (pending.length === 0) return;

  for (const t of pending) {
    const number = await nextOpsNumber('secondaryExpense', 'EXP', user.tenantId);
    await prisma.secondaryExpense.create({ data: supplyExpenseData(user, number, t, t.supply) });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supply.postExpenses',
    entityType: 'Supply',
    detail: `${pending.length} شراء مستلزمات حُسب في المصروفات`,
  });

  revalidatePath('/supplies');
  revalidatePath('/expenses');
}
