'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  isFormulaKind,
  isCostBasis,
  isCostCategory,
  requiresYield,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { nextFormulaCode, type FormState } from './shared';

// ── Formula header ──────────────────────────────────────────

const FormulaSchema = z.object({
  nameAr: z.string().trim().min(2, 'اسم المعادلة مطلوب.').max(120),
  kind: z.string().refine(isFormulaKind, 'نوع معادلة غير معروف.'),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function createFormula(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('formula.write');
  const parsed = FormulaSchema.safeParse({
    nameAr: String(formData.get('nameAr') ?? ''),
    kind: String(formData.get('kind') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const formula = await prisma.formula.create({
    data: {
      tenantId: user.tenantId,
      code: await nextFormulaCode(user.tenantId),
      nameAr: parsed.data.nameAr,
      kind: parsed.data.kind,
      notes: parsed.data.notes || null,
      // Every formula starts with an editable draft version 1. A formula
      // with no version at all would be a record that cannot be worked on.
      versions: { create: { version: 1, status: 'DRAFT' } },
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'formula.create',
    entityType: 'Formula',
    entityId: formula.id,
    detail: `${formula.code} ${formula.nameAr}`,
  });

  revalidatePath('/formulas');
  redirect(`/formulas/${formula.id}`);
}

export async function updateFormula(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('formula.write');
  const existing = await prisma.formula.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!existing) return { error: 'المعادلة غير موجودة.' };

  const parsed = FormulaSchema.safeParse({
    nameAr: String(formData.get('nameAr') ?? ''),
    kind: String(formData.get('kind') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  await prisma.formula.update({
    where: { id },
    data: {
      nameAr: parsed.data.nameAr,
      kind: parsed.data.kind,
      notes: parsed.data.notes || null,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'formula.update',
    entityType: 'Formula',
    entityId: id,
    detail: existing.code,
  });

  revalidatePath(`/formulas/${id}`);
  return { ok: 'تم حفظ التعديلات.' };
}

export async function deleteFormula(id: string): Promise<void> {
  const user = await requirePermission('formula.write');
  const formula = await prisma.formula.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: { _count: { select: { products: true } } },
  });
  if (!formula) redirect('/formulas');

  // A formula still assigned to a product would vanish from costing without
  // anyone being told. Unassign first, deliberately.
  if (formula._count.products > 0) redirect(`/formulas/${id}?err=assigned`);

  await prisma.formula.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'formula.softDelete',
    entityType: 'Formula',
    entityId: id,
    detail: formula.code,
  });

  revalidatePath('/formulas');
  redirect('/formulas');
}

// ── Versions ────────────────────────────────────────────────

/** Guard: only a DRAFT version may be edited. */
async function draftVersion(tenantId: string, versionId: string) {
  return prisma.formulaVersion.findFirst({
    where: { id: versionId, status: 'DRAFT', formula: { tenantId, isDeleted: false } },
    include: { formula: true },
  });
}

/**
 * Publish a draft.
 *
 * From this point the version is immutable and becomes what costing uses.
 * The previously current version is archived rather than deleted — snapshots
 * and older calculations still point at it.
 */
export async function publishVersion(versionId: string): Promise<void> {
  const user = await requirePermission('formula.write');
  const version = await draftVersion(user.tenantId, versionId);
  if (!version) redirect('/formulas');

  const lineCount = await prisma.formulaLine.count({ where: { formulaVersionId: versionId } });
  // Publishing an empty version would make every costed product silently
  // free. Refuse rather than produce a confident zero.
  if (lineCount === 0) redirect(`/formulas/${version.formulaId}?err=empty`);

  await prisma.$transaction(async (tx) => {
    if (version.formula.currentVersionId && version.formula.currentVersionId !== versionId) {
      await tx.formulaVersion.update({
        where: { id: version.formula.currentVersionId },
        data: { status: 'ARCHIVED' },
      });
    }
    await tx.formulaVersion.update({
      where: { id: versionId },
      data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: user.id },
    });
    await tx.formula.update({
      where: { id: version.formulaId },
      data: { currentVersionId: versionId },
    });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'formula.publish',
    entityType: 'FormulaVersion',
    entityId: versionId,
    detail: `${version.formula.code} v${version.version}`,
  });

  revalidatePath(`/formulas/${version.formulaId}`);
}

/**
 * Start the next version by copying the current one.
 *
 * This is what "editing a published formula" means here: the published
 * version is never touched, so every cost already calculated from it stays
 * exactly as it was.
 */
export async function startNewVersion(formulaId: string): Promise<void> {
  const user = await requirePermission('formula.write');
  const formula = await prisma.formula.findFirst({
    where: { id: formulaId, tenantId: user.tenantId, isDeleted: false },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
      currentVersion: { include: { lines: { orderBy: { sequence: 'asc' } }, params: true } },
    },
  });
  if (!formula) redirect('/formulas');

  const openDraft = await prisma.formulaVersion.findFirst({
    where: { formulaId, status: 'DRAFT' },
  });
  // One draft at a time — two open drafts and nobody can say which one is
  // "the next version".
  if (openDraft) redirect(`/formulas/${formulaId}?err=draft-exists`);

  const source = formula.currentVersion;
  const nextNumber = (formula.versions[0]?.version ?? 0) + 1;

  await prisma.formulaVersion.create({
    data: {
      formulaId,
      version: nextNumber,
      status: 'DRAFT',
      notes: source ? `نسخة من الإصدار ${source.version}` : null,
      lines: source
        ? {
            create: source.lines.map((l) => ({
              sequence: l.sequence,
              category: l.category,
              nameAr: l.nameAr,
              materialId: l.materialId,
              basis: l.basis,
              quantity: l.quantity,
              yieldQty: l.yieldQty,
              unit: l.unit,
              unitCost: l.unitCost,
              notes: l.notes,
            })),
          }
        : undefined,
      params: source
        ? {
            create: source.params.map((p) => ({
              key: p.key,
              nameAr: p.nameAr,
              value: p.value,
              unit: p.unit,
            })),
          }
        : undefined,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'formula.newVersion',
    entityType: 'Formula',
    entityId: formulaId,
    detail: `v${nextNumber}`,
  });

  revalidatePath(`/formulas/${formulaId}`);
}

// ── Lines ───────────────────────────────────────────────────

const LineSchema = z
  .object({
    category: z.string().refine(isCostCategory, 'بند تكلفة غير معروف.'),
    nameAr: z.string().trim().min(2, 'اسم البند مطلوب.').max(120),
    basis: z.string().refine(isCostBasis, 'أساس حساب غير معروف.'),
    quantity: z.coerce.number().min(0, 'الكمية لا يمكن أن تكون سالبة.'),
    yieldQty: z.coerce.number().min(0).optional(),
    unit: z.string().trim().max(24).optional().or(z.literal('')),
    unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.'),
    materialId: z.string().optional(),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine((v) => !requiresYield(v.basis as never) || (v.yieldQty ?? 0) > 0, {
    message: 'عدد القطع المنتَجة مطلوب مع هذا الأساس.',
    path: ['yieldQty'],
  })
  .refine((v) => v.basis !== 'PERCENT_OF_DIRECT' || v.quantity <= 100, {
    message: 'النسبة لا يمكن أن تتجاوز ١٠٠٪.',
    path: ['quantity'],
  });

function readLine(formData: FormData) {
  return {
    category: String(formData.get('category') ?? ''),
    nameAr: String(formData.get('nameAr') ?? ''),
    basis: String(formData.get('basis') ?? ''),
    quantity: String(formData.get('quantity') ?? '0'),
    yieldQty: String(formData.get('yieldQty') ?? '') || undefined,
    unit: String(formData.get('unit') ?? ''),
    unitCost: String(formData.get('unitCost') ?? '0'),
    materialId: String(formData.get('materialId') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  };
}

export async function addLine(
  versionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('formula.write');
  const version = await draftVersion(user.tenantId, versionId);
  if (!version) return { error: 'لا يمكن التعديل إلا على إصدار مسودة.' };

  const parsed = LineSchema.safeParse(readLine(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const last = await prisma.formulaLine.findFirst({
    where: { formulaVersionId: versionId },
    orderBy: { sequence: 'desc' },
  });

  await prisma.formulaLine.create({
    data: {
      formulaVersionId: versionId,
      sequence: (last?.sequence ?? 0) + 1,
      category: parsed.data.category,
      nameAr: parsed.data.nameAr,
      materialId: parsed.data.materialId || null,
      basis: parsed.data.basis,
      quantity: parsed.data.quantity,
      yieldQty: parsed.data.basis === 'PER_YIELD' ? (parsed.data.yieldQty ?? 0) : null,
      unit: parsed.data.unit || null,
      unitCost: parsed.data.unitCost,
      notes: parsed.data.notes || null,
    },
  });

  revalidatePath(`/formulas/${version.formulaId}`);
  return { ok: 'تمت إضافة البند.' };
}

export async function deleteLine(formulaId: string, lineId: string): Promise<void> {
  const user = await requirePermission('formula.write');
  const line = await prisma.formulaLine.findFirst({
    where: {
      id: lineId,
      formulaVersion: { status: 'DRAFT', formula: { id: formulaId, tenantId: user.tenantId } },
    },
  });
  // Silently doing nothing is correct here: the only way to reach this with
  // a published version is a stale page, and the version must not change.
  if (line) await prisma.formulaLine.delete({ where: { id: lineId } });

  revalidatePath(`/formulas/${formulaId}`);
}

// ── Parameters ──────────────────────────────────────────────

const ParamSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2, 'المفتاح مطلوب.')
    .max(40)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'المفتاح بالإنجليزية بدون مسافات.'),
  nameAr: z.string().trim().min(2, 'الاسم مطلوب.').max(120),
  value: z.coerce.number().min(0, 'القيمة لا يمكن أن تكون سالبة.'),
  unit: z.string().trim().max(24).optional().or(z.literal('')),
});

export async function setParam(
  versionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('formula.write');
  const version = await draftVersion(user.tenantId, versionId);
  if (!version) return { error: 'لا يمكن التعديل إلا على إصدار مسودة.' };

  const parsed = ParamSchema.safeParse({
    key: String(formData.get('key') ?? ''),
    nameAr: String(formData.get('nameAr') ?? ''),
    value: String(formData.get('value') ?? '0'),
    unit: String(formData.get('unit') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  await prisma.formulaParam.upsert({
    where: { formulaVersionId_key: { formulaVersionId: versionId, key: parsed.data.key } },
    update: {
      nameAr: parsed.data.nameAr,
      value: parsed.data.value,
      unit: parsed.data.unit || null,
    },
    create: {
      formulaVersionId: versionId,
      key: parsed.data.key,
      nameAr: parsed.data.nameAr,
      value: parsed.data.value,
      unit: parsed.data.unit || null,
    },
  });

  revalidatePath(`/formulas/${version.formulaId}`);
  return { ok: 'تم حفظ المعامل.' };
}

export async function deleteParam(formulaId: string, paramId: string): Promise<void> {
  const user = await requirePermission('formula.write');
  const param = await prisma.formulaParam.findFirst({
    where: {
      id: paramId,
      formulaVersion: { status: 'DRAFT', formula: { id: formulaId, tenantId: user.tenantId } },
    },
  });
  if (param) await prisma.formulaParam.delete({ where: { id: paramId } });

  revalidatePath(`/formulas/${formulaId}`);
}

// ── Product assignment ──────────────────────────────────────

export async function assignFormula(
  formulaId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('formula.write');
  const productId = String(formData.get('productId') ?? '');
  const variantId = String(formData.get('variantId') ?? '') || null;

  if (!productId) return { fieldErrors: { productId: 'اختر منتجاً.' } };

  const [formula, product] = await Promise.all([
    prisma.formula.findFirst({ where: { id: formulaId, tenantId: user.tenantId, isDeleted: false } }),
    prisma.product.findFirst({ where: { id: productId, tenantId: user.tenantId, isDeleted: false } }),
  ]);
  if (!formula || !product) return { error: 'المعادلة أو المنتج غير موجود.' };

  if (variantId) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, isDeleted: false },
    });
    if (!variant) return { fieldErrors: { variantId: 'المتغيّر لا يخص هذا المنتج.' } };
  }

  const existing = await prisma.productFormula.findFirst({
    where: { productId, variantId, formulaId },
  });
  if (existing) return { error: 'هذا الربط موجود بالفعل.' };

  await prisma.productFormula.create({ data: { productId, variantId, formulaId } });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'formula.assign',
    entityType: 'Formula',
    entityId: formulaId,
    detail: `${formula.code} -> ${product.sku}${variantId ? ' (variant)' : ' (all variants)'}`,
  });

  revalidatePath(`/formulas/${formulaId}`);
  return { ok: 'تم الربط.' };
}

export async function unassignFormula(formulaId: string, assignmentId: string): Promise<void> {
  const user = await requirePermission('formula.write');
  const assignment = await prisma.productFormula.findFirst({
    where: { id: assignmentId, formula: { id: formulaId, tenantId: user.tenantId } },
  });
  if (assignment) await prisma.productFormula.delete({ where: { id: assignmentId } });

  revalidatePath(`/formulas/${formulaId}`);
}
