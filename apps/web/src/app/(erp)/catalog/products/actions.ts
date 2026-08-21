'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isPriceService } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';

export interface FormState {
  error?: string;
  /** Set on success. The modal closes on it; the full page shows it. */
  ok?: string;
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

/** The one implementation. The two entry points differ only in the ending. */
async function createProductCore(
  formData: FormData,
): Promise<{ state: FormState; id?: string; sku?: string }> {
  const user = await requirePermission('products.write');
  const parsed = ProductSchema.safeParse(read(formData));
  if (!parsed.success) return { state: { fieldErrors: fieldErrors(parsed.error) } };

  const clash = await prisma.product.findFirst({
    where: { tenantId: user.tenantId, sku: parsed.data.sku },
  });
  if (clash) return { state: { fieldErrors: { sku: 'هذا الكود مستخدم بالفعل.' } } };

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

  revalidatePath('/catalog/products');
  return { state: {}, id: created.id, sku: created.sku };
}

export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await createProductCore(formData);
  if (!result.id) return result.state;
  redirect(`/catalog/products/${result.id}`);
}

/**
 * Modal entry point — returns rather than navigating away from the list.
 *
 * The default variant is still created here, exactly as on the full page:
 * stock lives on the variant, so a product without one is unstockable.
 */
export async function createProductInline(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await createProductCore(formData);
  if (!result.id) return result.state;
  return { ok: `تم إنشاء المنتج ${result.sku}.` };
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

  revalidatePath('/catalog/products');
  revalidatePath(`/catalog/products/${id}`);
  return { ok: 'تم حفظ التعديلات.' };
}

export async function deleteProduct(id: string): Promise<void> {
  const user = await requirePermission('products.write');
  const current = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) redirect('/catalog/products');

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

  revalidatePath('/catalog/products');
  redirect('/catalog/products');
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

  revalidatePath(`/catalog/products/${productId}`);
  return {};
}

/**
 * إضافة عدة ألوان للمنتج دفعة واحدة.
 *
 * إنشاء متغيّر لكل لون على حدة متعب، والمالك يريد أن «يضيف اللون فيسمعه
 * المنتج». هذا يأخذ الألوان المختارة ويصنع متغيّراً لكل لون بلا مقاس —
 * فيظهر اللون فوراً على المنتج وصفحته العامة وفي اختيار سطر الأمر
 * والفاتورة. الألوان الموجودة سلفاً تُتخطّى بلا خطأ.
 *
 * الكود يُشتقّ من كود المنتج واللون فيبقى مقروءاً وفريداً.
 */
export async function addColorsToProduct(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('products.write');

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId, isDeleted: false },
    select: { sku: true },
  });
  if (!product) return { error: 'المنتج غير موجود.' };

  const colorIds = formData.getAll('colorIds').map(String).filter(Boolean);
  if (colorIds.length === 0) return { error: 'اختر لوناً واحداً على الأقل.' };

  // الألوان الموجودة سلفاً كمتغيّرات بلا مقاس — لا تُكرَّر.
  const existing = await prisma.productVariant.findMany({
    where: { productId, sizeId: null, colorId: { in: colorIds } },
    select: { colorId: true },
  });
  const have = new Set(existing.map((v) => v.colorId));

  const colors = await prisma.color.findMany({
    where: { tenantId: user.tenantId, id: { in: colorIds }, isDeleted: false },
    select: { id: true, nameAr: true, nameEn: true },
  });

  let added = 0;
  for (const color of colors) {
    if (have.has(color.id)) continue;
    // كود فريد: كود المنتج + رمز اللون (إنجليزي إن وُجد وإلا مقطع المعرّف).
    const suffix = (color.nameEn || color.id.slice(-4)).replace(/\s+/g, '-').toUpperCase();
    let sku = `${product.sku}-${suffix}`;
    // في النادر أن يتصادم الكود، يُلحق بمقطع من معرّف اللون.
    if (await prisma.productVariant.findUnique({ where: { sku } })) {
      sku = `${sku}-${color.id.slice(-3)}`;
    }
    await prisma.productVariant.create({
      data: { productId, sku, colorId: color.id, sizeId: null },
    });
    added += 1;
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'variant.create',
    entityType: 'Product',
    entityId: productId,
    detail: `${added} لون`,
  });

  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/');
  return { ok: added > 0 ? `أُضيف ${added} لون. ظاهر على المنتج وصفحته الآن.` : 'كل الألوان المختارة موجودة سلفاً.' };
}

export async function deleteVariant(productId: string, variantId: string): Promise<void> {
  const user = await requirePermission('products.write');

  // A variant that has ever moved stock must never disappear — the movement
  // history points at it. Soft-delete instead.
  const movements = await prisma.stockMovement.count({ where: { variantId } });

  // ProductVariant لا يحمل tenantId — ملكيّته عبر منتجه. الشرط يمرّ من
  // هناك، وبدونه يمسح صاحب الصلاحية متغيّر أي شركة بمعرفة رقمه.
  await prisma.productVariant.updateMany({
    where: { id: variantId, product: { tenantId: user.tenantId } },
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

  revalidatePath(`/catalog/products/${productId}`);
}

// ── شرائح الأسعار ───────────────────────────────────────────
//
// سعر البيع ليس رقماً واحداً: القطعة لها سعر مع التطريز وآخر مع DTF،
// ولكلٍّ سعر جملة وسعر للكميات الصغيرة. كل شريحة صف يُضاف ويُحذف من هنا.

const TierSchema = z
  .object({
    service: z.string().refine(isPriceService, 'خدمة غير معروفة.'),
    minQty: z.number().int().min(1, 'أقل كمية 1.'),
    maxQty: z.number().int().min(1).nullable(),
    price: z.number().min(0, 'السعر لا يكون سالباً.'),
    variantId: z.string().optional(),
  })
  // نطاق مقلوب لا يغطّي شيئاً، ويمرّ بصمت لو لم يُفحص هنا.
  .refine((v) => v.maxQty === null || v.maxQty >= v.minQty, {
    message: 'الحد الأعلى يجب ألا يقل عن الأدنى.',
    path: ['maxQty'],
  });

export async function addPriceTier(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('products.write');

  const rawMax = String(formData.get('maxQty') ?? '').trim();
  const parsed = TierSchema.safeParse({
    service: String(formData.get('service') ?? ''),
    minQty: Number(String(formData.get('minQty') ?? '')),
    maxQty: rawMax === '' ? null : Number(rawMax),
    price: Number(String(formData.get('price') ?? '')),
    variantId: String(formData.get('variantId') ?? '') || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const company = await prisma.company.findFirst({
    where: { tenantId: user.tenantId },
    select: { currency: true },
  });

  try {
    await prisma.priceTier.create({
      data: {
        tenantId: user.tenantId,
        productId,
        variantId: parsed.data.variantId ?? null,
        service: parsed.data.service,
        minQty: parsed.data.minQty,
        maxQty: parsed.data.maxQty,
        price: parsed.data.price.toFixed(4),
        currency: company?.currency ?? 'IQD',
      },
    });
  } catch {
    // القيد الفريد على قاعدة البيانات هو ما يمنع التكرار — لا فحص في الكود،
    // لأن طلبين متزامنين يمرّان عليه معاً.
    return { error: 'توجد شريحة بنفس الخدمة ونفس الحد الأدنى لهذا المنتج.' };
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'price-tier.create',
    entityType: 'PriceTier',
    entityId: productId,
    detail: `${parsed.data.service} · من ${parsed.data.minQty} · ${parsed.data.price}`,
  });

  revalidatePath(`/catalog/products/${productId}`);
  return { ok: 'أُضيفت الشريحة.' };
}

export async function deletePriceTier(productId: string, tierId: string) {
  const user = await requirePermission('products.write');
  await prisma.priceTier.deleteMany({ where: { id: tierId, tenantId: user.tenantId } });
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'price-tier.delete',
    entityType: 'PriceTier',
    entityId: tierId,
  });
  revalidatePath(`/catalog/products/${productId}`);
}
