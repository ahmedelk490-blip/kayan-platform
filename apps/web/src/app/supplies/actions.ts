'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dec, isSupplyKind, isSupplyTxType, supplyDelta, SUPPLY_CATEGORIES } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { parseDateOr, type FormState } from '@/lib/ops';

const SupplySchema = z
  .object({
    nameAr: z.string().trim().min(2, 'الاسم مطلوب.').max(120),
    kind: z.string().refine(isSupplyKind, 'نوع غير معروف.'),
    category: z.string().min(1, 'الفئة مطلوبة.'),
    unit: z.string().trim().max(24).optional().or(z.literal('')),
    minStock: z.coerce.number().min(0).optional(),
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

const TxSchema = z.object({
  supplyId: z.string().min(1, 'اختر المستلزم.'),
  type: z.string().refine(isSupplyTxType, 'نوع حركة غير معروف.'),
  txDate: z.string().optional(),
  quantity: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر.'),
  unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.'),
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
  const unitCost = dec(parsed.data.unitCost);
  const totalCost = quantity.times(unitCost);
  const delta = supplyDelta(parsed.data.type as 'PURCHASE' | 'CONSUMPTION', quantity);

  await tenantTransaction(async (tx) => {
    await tx.supplyTransaction.create({
      data: {
        tenantId: user.tenantId,
        supplyId: supply.id,
        type: parsed.data.type,
        txDate: parseDateOr(parsed.data.txDate),
        quantity: quantity.toString(),
        unitCost: unitCost.toString(),
        totalCost: totalCost.toString(),
        productionOrderId: parsed.data.productionOrderId || null,
        notes: parsed.data.notes || null,
        userId: user.id,
      },
    });

    await tx.supply.update({
      where: { id: supply.id },
      data: {
        onHand: dec(supply.onHand).plus(delta).toString(),
        // A purchase tells us today's price; consumption does not.
        ...(parsed.data.type === 'PURCHASE' && unitCost.gt(0)
          ? { lastUnitCost: unitCost.toString() }
          : {}),
      },
    });
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
  return { ok: 'تم تسجيل الحركة.' };
}
