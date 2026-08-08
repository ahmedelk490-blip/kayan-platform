'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const ProductSchema = z.object({
  nameAr: z.string().trim().min(2, 'الاسم بالعربية مطلوب.').max(200),
  nameEn: z.string().trim().max(200).optional().or(z.literal('')),
  sku: z.string().trim().min(2, 'الكود مطلوب.').max(60),
  barcode: z.string().trim().max(60).optional().or(z.literal('')),
  categoryId: z.string().trim().min(1, 'التصنيف مطلوب.'),
  descriptionAr: z.string().trim().max(2000).optional().or(z.literal('')),
  cost: z.string().trim().optional(),
  sellingPrice: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'DISCONTINUED']),
});

function num(value?: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function read(formData: FormData) {
  return {
    nameAr: String(formData.get('nameAr') ?? ''),
    nameEn: String(formData.get('nameEn') ?? ''),
    sku: String(formData.get('sku') ?? ''),
    barcode: String(formData.get('barcode') ?? ''),
    categoryId: String(formData.get('categoryId') ?? ''),
    descriptionAr: String(formData.get('descriptionAr') ?? ''),
    cost: String(formData.get('cost') ?? ''),
    sellingPrice: String(formData.get('sellingPrice') ?? ''),
    status: String(formData.get('status') ?? 'ACTIVE'),
  };
}

/** Replace a product's many-to-many option links with the submitted set. */
async function syncLinks(productId: string, formData: FormData) {
  const materials = formData.getAll('materials').map(String).filter(Boolean);
  const printing = formData.getAll('printingOptions').map(String).filter(Boolean);
  const embroidery = formData.getAll('embroideryOptions').map(String).filter(Boolean);

  await prisma.$transaction([
    prisma.productMaterial.deleteMany({ where: { productId } }),
    prisma.productPrintingOption.deleteMany({ where: { productId } }),
    prisma.productEmbroideryOption.deleteMany({ where: { productId } }),
    prisma.productMaterial.createMany({
      data: materials.map((materialId) => ({ productId, materialId })),
    }),
    prisma.productPrintingOption.createMany({
      data: printing.map((optionId) => ({ productId, optionId })),
    }),
    prisma.productEmbroideryOption.createMany({
      data: embroidery.map((optionId) => ({ productId, optionId })),
    }),
  ]);
}

export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('products.write');
  const parsed = ProductSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const clash = await prisma.product.findFirst({
    where: { tenantId: user.tenantId, sku: parsed.data.sku },
  });
  if (clash) return { fieldErrors: { sku: 'هذا الكود مستخدم بالفعل.' } };

  const created = await prisma.product.create({
    data: {
      tenantId: user.tenantId,
      categoryId: parsed.data.categoryId,
      sku: parsed.data.sku,
      nameAr: parsed.data.nameAr,
      nameEn: parsed.data.nameEn || null,
      barcode: parsed.data.barcode || null,
      descriptionAr: parsed.data.descriptionAr || null,
      cost: num(parsed.data.cost),
      sellingPrice: num(parsed.data.sellingPrice),
      status: parsed.data.status,
      // Every product needs one stockable unit; stock lives on the variant.
      variants: { create: { sku: `${parsed.data.sku}-DEF` } },
    },
  });

  await syncLinks(created.id, formData);
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'product.create',
    entityType: 'Product',
    entityId: created.id,
    detail: created.sku,
  });

  revalidatePath('/products');
  redirect(`/products/${created.id}`);
}

export async function updateProduct(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('products.write');
  const parsed = ProductSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const current = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) return { error: 'المنتج غير موجود.' };

  const clash = await prisma.product.findFirst({
    where: { tenantId: user.tenantId, sku: parsed.data.sku, NOT: { id } },
  });
  if (clash) return { fieldErrors: { sku: 'هذا الكود مستخدم بالفعل.' } };

  await prisma.product.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      sku: parsed.data.sku,
      nameAr: parsed.data.nameAr,
      nameEn: parsed.data.nameEn || null,
      barcode: parsed.data.barcode || null,
      descriptionAr: parsed.data.descriptionAr || null,
      cost: num(parsed.data.cost),
      sellingPrice: num(parsed.data.sellingPrice),
      status: parsed.data.status,
    },
  });

  await syncLinks(id, formData);
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'product.update',
    entityType: 'Product',
    entityId: id,
    detail: parsed.data.sku,
  });

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  return {};
}

export async function deleteProduct(id: string): Promise<void> {
  const user = await requirePermission('products.write');
  const current = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) redirect('/products');

  await prisma.product.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'product.softDelete',
    entityType: 'Product',
    entityId: id,
    detail: current.sku,
  });

  revalidatePath('/products');
  redirect('/products');
}

// ── Variants ────────────────────────────────────────────────

const VariantSchema = z.object({
  sku: z.string().trim().min(2, 'كود المتغيّر مطلوب.').max(60),
  barcode: z.string().trim().max(60).optional().or(z.literal('')),
  colorId: z.string().trim().optional(),
  sizeId: z.string().trim().optional(),
  cost: z.string().trim().optional(),
  sellingPrice: z.string().trim().optional(),
});

export async function createVariant(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('products.write');
  const parsed = VariantSchema.safeParse({
    sku: String(formData.get('sku') ?? ''),
    barcode: String(formData.get('barcode') ?? ''),
    colorId: String(formData.get('colorId') ?? ''),
    sizeId: String(formData.get('sizeId') ?? ''),
    cost: String(formData.get('cost') ?? ''),
    sellingPrice: String(formData.get('sellingPrice') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId, isDeleted: false },
  });
  if (!product) return { error: 'المنتج غير موجود.' };

  const colorId = parsed.data.colorId || null;
  const sizeId = parsed.data.sizeId || null;

  // The (product, colour, size) unique constraint is the real guard; this
  // check exists to return a readable message instead of a 500.
  const duplicate = await prisma.productVariant.findFirst({
    where: { productId, colorId, sizeId },
  });
  if (duplicate) return { error: 'يوجد متغيّر بنفس اللون والمقاس بالفعل.' };

  const skuClash = await prisma.productVariant.findUnique({ where: { sku: parsed.data.sku } });
  if (skuClash) return { fieldErrors: { sku: 'هذا الكود مستخدم بالفعل.' } };

  const created = await prisma.productVariant.create({
    data: {
      productId,
      sku: parsed.data.sku,
      barcode: parsed.data.barcode || null,
      colorId,
      sizeId,
      cost: num(parsed.data.cost),
      sellingPrice: num(parsed.data.sellingPrice),
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'variant.create',
    entityType: 'ProductVariant',
    entityId: created.id,
    detail: created.sku,
  });

  revalidatePath(`/products/${productId}`);
  return {};
}

export async function deleteVariant(productId: string, variantId: string): Promise<void> {
  const user = await requirePermission('products.write');

  // A variant that has ever moved stock must never disappear — the movement
  // history points at it. Soft-delete instead.
  const movements = await prisma.stockMovement.count({ where: { variantId } });

  await prisma.productVariant.update({
    where: { id: variantId },
    data: { isDeleted: true, deletedAt: new Date(), isActive: false },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'variant.softDelete',
    entityType: 'ProductVariant',
    entityId: variantId,
    detail: `movements=${movements}`,
  });

  revalidatePath(`/products/${productId}`);
}
