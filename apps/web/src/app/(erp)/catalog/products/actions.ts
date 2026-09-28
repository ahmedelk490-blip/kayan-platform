'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import sharp from 'sharp';
import { isPriceService, dec } from '@erp/domain';
import { userCan } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import { normalizeDigits } from '@/lib/num';

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
  piecesPerDozen: z.string().trim().optional(),
  dozenCost: z.string().trim().optional(),
  dozenPrice: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'DISCONTINUED']),
});

function num(value?: string): number | null {
  if (!value) return null;
  // التطبيع يجعل «١٦٠٠٠» المكتوبة بالأرقام العربية رقماً مقبولاً.
  const n = Number(normalizeDigits(value));
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
    piecesPerDozen: String(formData.get('piecesPerDozen') ?? ''),
    dozenCost: String(formData.get('dozenCost') ?? ''),
    dozenPrice: String(formData.get('dozenPrice') ?? ''),
    status: String(formData.get('status') ?? 'ACTIVE'),
  };
}

/**
 * حقول الدستة المحسوبة: قطع الدستة وتكلفتها وسعرها، وتكلفة/سعر القطعة مشتقّان
 * بالقسمة (إن أُدخلت الدستة)، وإلا تُستعمل التكلفة/السعر المباشران كما هما.
 */
function dozenFields(
  d: {
    piecesPerDozen?: string;
    dozenCost?: string;
    dozenPrice?: string;
    cost?: string;
    sellingPrice?: string;
  },
  /**
   * التكلفة الحالية حين لا يملك المرسِل صلاحية رؤيتها.
   *
   * حقول التكلفة لا تُرسَل أصلاً لمن لا يراها (فلا تظهر في الصفحة ولو مخفيّة)،
   * فلو أُهملت هنا لمُحيت بمجرّد تعديل الاسم. تُحفَظ كما هي بدلاً من ذلك.
   */
  keepCost?: { dozenCost: number | null; cost: number | null },
) {
  const pieces = Math.max(1, Math.round(Number(d.piecesPerDozen) || 12));
  const dc = num(d.dozenCost);
  const dp = num(d.dozenPrice);
  const costFields = keepCost
    ? { dozenCost: keepCost.dozenCost, cost: keepCost.cost }
    : { dozenCost: dc, cost: dc !== null ? dc / pieces : num(d.cost) };
  return {
    piecesPerDozen: pieces,
    ...costFields,
    dozenPrice: dp,
    sellingPrice: dp !== null ? dp / pieces : num(d.sellingPrice),
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

  // المتغيّرات من الألوان والمقاسات المختارة عند الإنشاء — بدل خطوة لاحقة على
  // صفحة المنتج. لكل (لون×مقاس) متغيّر، أو للألوان وحدها، أو للمقاسات وحدها،
  // وإلا متغيّر افتراضي واحد. المخزون يُتتبَّع على المتغيّر، فهكذا تظهر
  // المقاسات والألوان في المخزون فوراً.
  const colorIds = formData.getAll('colorIds').map(String).filter(Boolean);
  const sizeIds = formData.getAll('sizeIds').map(String).filter(Boolean);
  const [colors, sizes] = await Promise.all([
    colorIds.length
      ? prisma.color.findMany({
          where: { tenantId: user.tenantId, id: { in: colorIds }, isDeleted: false },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, nameEn: true },
        })
      : Promise.resolve([]),
    sizeIds.length
      ? prisma.size.findMany({
          where: { tenantId: user.tenantId, id: { in: sizeIds }, isDeleted: false },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ]);

  const base = parsed.data.sku;
  // رمز اللون: الإنجليزي إن وُجد وإلا مقطع من المعرّف — كما في إضافة الألوان.
  const colorSku = (c: { nameEn: string | null; id: string }) =>
    (c.nameEn || c.id.slice(-4)).replace(/\s+/g, '-').toUpperCase();

  type NewVariant = { sku: string; colorId?: string | null; sizeId?: string | null };
  let variantData: NewVariant[] = [];
  if (colors.length && sizes.length) {
    for (const c of colors)
      for (const s of sizes)
        variantData.push({ sku: `${base}-${colorSku(c)}-${s.code}`, colorId: c.id, sizeId: s.id });
  } else if (colors.length) {
    for (const c of colors) variantData.push({ sku: `${base}-${colorSku(c)}`, colorId: c.id });
  } else if (sizes.length) {
    for (const s of sizes) variantData.push({ sku: `${base}-${s.code}`, sizeId: s.id });
  } else {
    // Every product needs one stockable unit; stock lives on the variant.
    variantData = [{ sku: `${base}-DEF` }];
  }

  if (variantData.length > 300) {
    return {
      state: { error: 'عدد المتغيّرات كبير جداً (الألوان × المقاسات). قلّل الاختيار.' },
    };
  }

  const created = await prisma.product.create({
    data: {
      tenantId: user.tenantId,
      categoryId: parsed.data.categoryId,
      sku: parsed.data.sku,
      nameAr: parsed.data.nameAr,
      nameEn: parsed.data.nameEn || null,
      barcode: parsed.data.barcode || null,
      descriptionAr: parsed.data.descriptionAr || null,
      ...dozenFields(parsed.data),
      status: parsed.data.status,
      // يظهر على الموقع فور إنشائه (ما دام نشطاً) — بطلب المالك. يبقى قابلاً
      // للإخفاء لاحقاً من صفحة المنتج إن لزم.
      showOnSite: true,
      variants: { create: variantData },
    },
    include: { variants: { select: { id: true } } },
  });

  // صفّ مخزون بصفر لكل متغيّر في المخزن الرئيسي، ليظهر المنتج في أرصدة
  // المخزون فور إنشائه بدل أن يغيب حتى يُسجَّل له رصيد.
  const warehouse = await prisma.warehouse.findFirst({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (warehouse && created.variants.length > 0) {
    await prisma.stock.createMany({
      data: created.variants.map((v) => ({ variantId: v.id, warehouseId: warehouse.id })),
      skipDuplicates: true,
    });
  }

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
  // الصفحات العامة أيضاً — فالمنتج الجديد النشط يظهر على الموقع فوراً.
  revalidatePath('/');
  revalidatePath('/products');
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
      // من لا يملك صلاحية التكلفة لا يُرسلها ولا يمسّها: تبقى كما هي.
      ...dozenFields(
        parsed.data,
        userCan(user.role, user.overrides, 'cost.view')
          ? undefined
          : {
              dozenCost: current.dozenCost === null ? null : Number(current.dozenCost),
              cost: current.cost === null ? null : Number(current.cost),
            },
      ),
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
  // الصفحات العامة أيضاً — فالتعديل يظهر على الموقع فوراً بلا انتظار أي كاش.
  revalidatePath('/');
  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
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
  revalidatePath('/');
  revalidatePath('/products');
  redirect('/catalog/products');
}

/** استرجاع منتج محذوف — يعيده للنظام (وللموقع إن كان نشطاً ومعروضاً). */
export async function restoreProduct(id: string): Promise<void> {
  const user = await requirePermission('products.write');
  const product = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: true },
    select: { id: true, sku: true },
  });
  if (!product) redirect('/catalog/products/deleted');

  await prisma.product.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'product.restore',
    entityType: 'Product',
    entityId: id,
    detail: product.sku,
  });

  revalidatePath('/catalog/products');
  revalidatePath('/catalog/products/deleted');
  revalidatePath('/');
  revalidatePath('/products');
  redirect(`/catalog/products/${id}`);
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
  const sizeIds = formData.getAll('sizeIds').map(String).filter(Boolean);
  if (colorIds.length === 0 && sizeIds.length === 0) {
    return { error: 'اختر لوناً أو مقاساً واحداً على الأقل.' };
  }

  const [colors, sizes, warehouse] = await Promise.all([
    colorIds.length
      ? prisma.color.findMany({
          where: { tenantId: user.tenantId, id: { in: colorIds }, isDeleted: false },
          select: { id: true, nameEn: true },
        })
      : Promise.resolve([]),
    sizeIds.length
      ? prisma.size.findMany({
          where: { tenantId: user.tenantId, id: { in: sizeIds }, isDeleted: false },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
    prisma.warehouse.findFirst({
      where: { tenantId: user.tenantId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }),
  ]);

  const colorSku = (c: { nameEn: string | null; id: string }) =>
    (c.nameEn || c.id.slice(-4)).replace(/\s+/g, '-').toUpperCase();

  // تركيبات (لون×مقاس)، أو الألوان وحدها، أو المقاسات وحدها.
  type Combo = { colorId: string | null; sizeId: string | null; sku: string };
  const combos: Combo[] = [];
  if (colors.length && sizes.length) {
    for (const c of colors)
      for (const s of sizes)
        combos.push({ colorId: c.id, sizeId: s.id, sku: `${product.sku}-${colorSku(c)}-${s.code}` });
  } else if (colors.length) {
    for (const c of colors) combos.push({ colorId: c.id, sizeId: null, sku: `${product.sku}-${colorSku(c)}` });
  } else {
    for (const s of sizes) combos.push({ colorId: null, sizeId: s.id, sku: `${product.sku}-${s.code}` });
  }

  let added = 0;
  for (const combo of combos) {
    const exists = await prisma.productVariant.findFirst({
      where: { productId, colorId: combo.colorId, sizeId: combo.sizeId },
      select: { id: true },
    });
    if (exists) continue;
    // كود فريد عالمياً: لو تصادم يُلحق بمقطع عشوائي.
    let sku = combo.sku;
    if (await prisma.productVariant.findUnique({ where: { sku } })) {
      sku = `${sku}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }
    const v = await prisma.productVariant.create({
      data: { productId, sku, colorId: combo.colorId, sizeId: combo.sizeId },
    });
    if (warehouse) await prisma.stock.create({ data: { variantId: v.id, warehouseId: warehouse.id } });
    added += 1;
  }

  // عطّل المتغيّر الافتراضي (بلا لون/مقاس) بعد وجود متغيّرات حقيقية.
  if (added > 0 && (colors.length > 0 || sizes.length > 0)) {
    await prisma.productVariant.updateMany({
      where: { productId, colorId: null, sizeId: null, isDeleted: false },
      data: { isActive: false },
    });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'variant.create',
    entityType: 'Product',
    entityId: productId,
    detail: `${added} متغيّر (لون/مقاس)`,
  });

  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/');
  return {
    ok:
      added > 0
        ? `أُضيف ${added} متغيّر. يظهر على المنتج وفي المخزون والفاتورة الآن.`
        : 'كل التركيبات المختارة موجودة سلفاً.',
  };
}

/**
 * لونٌ جديد يُكتب في صفحة الموديل نفسه.
 *
 * كانت الألوان قائمةً عامّة واحدة: من يضيف لون تيشيرتٍ يراها وقد امتلأت
 * بألوان اليلك والشماغ، ومن يضيف لوناً يضيفه «للنظام» لا «للموديل». فيكتب
 * المالك أسماءً متقاربة ثم لا يعرف أيّها لأيّ موديل.
 *
 * هنا اللون يُكتب باسمه ولونه في صفحة موديله ويُربط به فوراً. وإن كان
 * الاسم موجوداً في المستأجر أُعيد استعمال صفّه — قيد التفرّد
 * `(tenantId, nameAr)` يمنع «أسود» ثانياً — فلا تتضاعف الألوان بينما
 * يرى كلُّ موديل ألوانه وحدها.
 */
export async function addColorToProduct(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('products.write');

  const nameAr = String(formData.get('nameAr') ?? '').trim();
  if (nameAr.length < 2) return { fieldErrors: { nameAr: 'اكتب اسم اللون.' } };

  const rawHex = String(formData.get('hex') ?? '').trim();
  const hex = /^#[0-9a-fA-F]{6}$/.test(rawHex) ? rawHex.toLowerCase() : null;

  const existing = await prisma.color.findFirst({
    where: { tenantId: user.tenantId, nameAr },
    select: { id: true, isDeleted: true },
  });

  let colorId: string;
  if (existing) {
    // لونٌ بالاسم نفسه موجود — يُعاد استعماله (وُيحيا إن كان مرفوعاً).
    colorId = existing.id;
    if (existing.isDeleted || hex) {
      await prisma.color.updateMany({
        where: { id: existing.id, tenantId: user.tenantId },
        data: { isDeleted: false, deletedAt: null, ...(hex ? { hex } : {}) },
      });
    }
  } else {
    const created = await prisma.color.create({
      data: { tenantId: user.tenantId, nameAr, hex },
      select: { id: true },
    });
    colorId = created.id;
  }

  return toggleProductColor(productId, colorId, true);
}

/**
 * مقاسٌ واحد للموديل — يُضاف بضغطة عبر كل ألوانه أو يُرفع بضغطة.
 *
 * مرآةُ `toggleProductColor`، وهي لازمةٌ معها لا زينة: من يضيف ألواناً
 * لموديلٍ لا مقاسات له بعد، تُنشأ ألوانه بلا مقاس — فلا يجد في تسجيل حركة
 * المخزون مقاساً يختاره، ولا في الفاتورة. المقاس هنا وحدةٌ كاللون تماماً،
 * تنتشر على ألوان الموديل كلّها.
 */
export async function toggleProductSize(
  productId: string,
  sizeId: string,
  add: boolean,
): Promise<FormState> {
  const user = await requirePermission('products.write');

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId, isDeleted: false },
    select: { sku: true },
  });
  if (!product) return { error: 'المنتج غير موجود.' };

  const size = await prisma.size.findFirst({
    where: { id: sizeId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true, code: true },
  });
  if (!size) return { error: 'المقاس غير موجود.' };

  const variants = await prisma.productVariant.findMany({
    where: { productId, isDeleted: false },
    select: { id: true, colorId: true, sizeId: true, color: { select: { nameEn: true } } },
  });

  if (!add) {
    const ofSize = variants.filter((v) => v.sizeId === sizeId);
    if (ofSize.length === 0) return { ok: `«${size.code}» غير مضاف أصلاً.` };

    const held = await prisma.stock.aggregate({
      where: { variantId: { in: ofSize.map((v) => v.id) } },
      _sum: { onHand: true },
    });
    const onHand = dec(held._sum.onHand ?? 0);
    if (onHand.gt(0)) {
      return {
        error: `لا يُرفع «${size.code}» وفي المخزن منه ${onHand.toString()} قطعة. اصرفها أو سوّ الرصيد أوّلاً.`,
      };
    }

    await prisma.productVariant.updateMany({
      where: { id: { in: ofSize.map((v) => v.id) }, product: { tenantId: user.tenantId } },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'variant.softDelete',
      entityType: 'Product',
      entityId: productId,
      detail: `مقاس ${size.code} — ${ofSize.length} متغيّر`,
    });

    revalidatePath(`/catalog/products/${productId}`);
    return { ok: `رُفِع «${size.code}» (${ofSize.length} لون).` };
  }

  // ألوان هذا الموديل — أو لا لون، فيُنشأ متغيّرٌ بالمقاس وحده.
  const colorsOfProduct = [
    ...new Map(
      variants.filter((v) => v.colorId).map((v) => [v.colorId as string, v.color?.nameEn ?? null]),
    ),
  ];
  const warehouse = await prisma.warehouse.findFirst({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const combos: { colorId: string | null; sku: string }[] = colorsOfProduct.length
    ? colorsOfProduct.map(([colorId, nameEn]) => ({
        colorId,
        sku: `${product.sku}-${(nameEn || colorId.slice(-4)).replace(/\s+/g, '-').toUpperCase()}-${size.code}`,
      }))
    : [{ colorId: null, sku: `${product.sku}-${size.code}` }];

  let added = 0;
  for (const combo of combos) {
    const existing = await prisma.productVariant.findFirst({
      where: { productId, colorId: combo.colorId, sizeId },
      select: { id: true, isDeleted: true },
    });
    if (existing) {
      if (existing.isDeleted) {
        await prisma.productVariant.updateMany({
          where: { id: existing.id, product: { tenantId: user.tenantId } },
          data: { isDeleted: false, deletedAt: null, isActive: true },
        });
        added += 1;
      }
      continue;
    }
    let sku = combo.sku;
    if (await prisma.productVariant.findUnique({ where: { sku } })) {
      sku = `${sku}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }
    const created = await prisma.productVariant.create({
      data: { productId, sku, colorId: combo.colorId, sizeId },
    });
    if (warehouse) {
      await prisma.stock.create({ data: { variantId: created.id, warehouseId: warehouse.id } });
    }
    added += 1;
  }

  // المتغيّر الأعمّ (لونٌ بلا مقاس) لم يعد يُباع بعد أن صار للّون مقاسات.
  if (added > 0) {
    await prisma.productVariant.updateMany({
      where: { productId, sizeId: null, isDeleted: false },
      data: { isActive: false },
    });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'variant.create',
    entityType: 'Product',
    entityId: productId,
    detail: `مقاس ${size.code} — ${added} متغيّر`,
  });

  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/');
  return {
    ok: added > 0 ? `أُضيف «${size.code}» (${added} لون).` : `«${size.code}» موجود سلفاً.`,
  };
}

/**
 * لونٌ واحد للمنتج — يُضاف بضغطة أو يُرفع بضغطة.
 *
 * المنتج بستّة مقاسات يعني أن إضافة لونٍ واحد ستّة متغيّرات، ورفعَه ستّة
 * حذفاتٍ واحداً واحداً. والمالك لا يفكّر بـ«متغيّر»: يفكّر بـ«هذا الموديل عندي
 * بأسود وكحلي». فاللون هنا وحدةٌ واحدة، والمقاسات تتبعه.
 *
 * والمقاسات المعتمدة مقاساتُ المنتج نفسه لا كلّ مقاسات النظام: لونٌ يُضاف
 * لموديلٍ يُباع بـ L–XL لا ينبغي أن يخلق مقاسات لا تُباع.
 *
 * والرفع يُرفض ما دام في المخزن منه شيء: إخفاء لونٍ عليه رصيد يترك البضاعة
 * في الرفّ ولا أحد يراها.
 */
export async function toggleProductColor(
  productId: string,
  colorId: string,
  add: boolean,
): Promise<FormState> {
  const user = await requirePermission('products.write');

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId, isDeleted: false },
    select: { sku: true },
  });
  if (!product) return { error: 'المنتج غير موجود.' };

  const color = await prisma.color.findFirst({
    where: { id: colorId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true, nameAr: true, nameEn: true },
  });
  if (!color) return { error: 'اللون غير موجود.' };

  const variants = await prisma.productVariant.findMany({
    where: { productId, isDeleted: false },
    select: { id: true, colorId: true, sizeId: true, size: { select: { code: true } } },
  });

  if (!add) {
    const ofColor = variants.filter((v) => v.colorId === colorId);
    if (ofColor.length === 0) return { ok: `«${color.nameAr}» غير مضاف أصلاً.` };

    const held = await prisma.stock.aggregate({
      where: { variantId: { in: ofColor.map((v) => v.id) } },
      _sum: { onHand: true },
    });
    const onHand = dec(held._sum.onHand ?? 0);
    if (onHand.gt(0)) {
      return {
        error: `لا يُرفع «${color.nameAr}» وفي المخزن منه ${onHand.toString()} قطعة. اصرفها أو سوّ الرصيد أوّلاً.`,
      };
    }

    // حذفٌ ليّن: حركات المخزون وبنود الفواتير تشير إلى هذه الصفوف.
    await prisma.productVariant.updateMany({
      where: { id: { in: ofColor.map((v) => v.id) }, product: { tenantId: user.tenantId } },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'variant.softDelete',
      entityType: 'Product',
      entityId: productId,
      detail: `لون ${color.nameAr} — ${ofColor.length} متغيّر`,
    });

    revalidatePath(`/catalog/products/${productId}`);
    return { ok: `رُفِع «${color.nameAr}» (${ofColor.length} مقاس).` };
  }

  // مقاسات هذا الموديل وحده، بلا تكرار.
  const sizesOfProduct = [
    ...new Map(variants.filter((v) => v.sizeId).map((v) => [v.sizeId as string, v.size?.code ?? ''])),
  ];
  const warehouse = await prisma.warehouse.findFirst({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const colorSku = (color.nameEn || color.id.slice(-4)).replace(/\s+/g, '-').toUpperCase();
  const combos: { sizeId: string | null; sku: string }[] = sizesOfProduct.length
    ? sizesOfProduct.map(([sizeId, code]) => ({ sizeId, sku: `${product.sku}-${colorSku}-${code}` }))
    : [{ sizeId: null, sku: `${product.sku}-${colorSku}` }];

  let added = 0;
  for (const combo of combos) {
    const existing = await prisma.productVariant.findFirst({
      where: { productId, colorId, sizeId: combo.sizeId },
      select: { id: true, isDeleted: true },
    });
    if (existing) {
      // لونٌ رُفِع ثم عاد: يُحيَى صفّه بتاريخه بدل أن يُنشأ ثانٍ بكود مختلف.
      if (existing.isDeleted) {
        await prisma.productVariant.updateMany({
          where: { id: existing.id, product: { tenantId: user.tenantId } },
          data: { isDeleted: false, deletedAt: null, isActive: true },
        });
        added += 1;
      }
      continue;
    }
    let sku = combo.sku;
    if (await prisma.productVariant.findUnique({ where: { sku } })) {
      sku = `${sku}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }
    const created = await prisma.productVariant.create({
      data: { productId, sku, colorId, sizeId: combo.sizeId },
    });
    if (warehouse) {
      await prisma.stock.create({ data: { variantId: created.id, warehouseId: warehouse.id } });
    }
    added += 1;
  }

  if (added > 0) {
    await prisma.productVariant.updateMany({
      where: { productId, colorId: null, sizeId: null, isDeleted: false },
      data: { isActive: false },
    });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'variant.create',
    entityType: 'Product',
    entityId: productId,
    detail: `لون ${color.nameAr} — ${added} متغيّر`,
  });

  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/');
  return {
    ok: added > 0 ? `أُضيف «${color.nameAr}» (${added} مقاس).` : `«${color.nameAr}» موجود سلفاً.`,
  };
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

  const rawMax = normalizeDigits(String(formData.get('maxQty') ?? ''));
  const parsed = TierSchema.safeParse({
    service: String(formData.get('service') ?? ''),
    minQty: Number(normalizeDigits(String(formData.get('minQty') ?? ''))),
    maxQty: rawMax === '' ? null : Number(rawMax),
    price: Number(normalizeDigits(String(formData.get('price') ?? ''))),
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

// ═══════════════════════════════════════════════════════════
// صور المنتج — رفع وحذف وترتيب من النظام
// ═══════════════════════════════════════════════════════════
//
// الصور القديمة ملفات على القرص. المرفوعة من هنا تعيش بايتاتها في القاعدة
// وتُقدَّم من /product-img/<id>، فتنجو من النشر الذي يمسح القرص. كل صورة
// تُعالَج بـ sharp (webp، بحجم معقول) فتُوحَّد وتُخفَّف ويُعزل الملف الخبيث.

const MAX_IMAGE_UPLOAD = 8 * 1024 * 1024; // 8MB
const IMAGE_ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** يعالج ملف صورة إلى webp مع أبعاده، أو يعيد رسالة خطأ نصية. */
async function processProductImage(
  file: unknown,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; width: number; height: number } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) return { error: 'اختر صورة.' };
  if (file.size > MAX_IMAGE_UPLOAD) return { error: 'الصورة أكبر من 8 ميجابايت.' };
  if (file.type && !IMAGE_ACCEPTED.has(file.type)) return { error: 'الصيغة غير مدعومة. استخدم JPG أو PNG أو WebP.' };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const { data, info } = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: 1200, height: 1500, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    return { bytes, width: info.width, height: info.height };
  } catch {
    return { error: 'تعذّرت قراءة الملف كصورة سليمة.' };
  }
}

export async function uploadProductImage(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('products.write');

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!product) return { error: 'المنتج غير موجود.' };

  const img = await processProductImage(formData.get('image'));
  if ('error' in img) return { fieldErrors: { image: img.error } };

  const last = await prisma.productImage.findFirst({
    where: { productId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  // أول صورة للمنتج تصير الأساسية تلقائياً.
  const isPrimary = product._count.images === 0;

  const created = await prisma.productImage.create({
    data: {
      productId,
      // المسار يشير إلى مسار البايتات؛ يُحدَّث بالمعرّف بعد الإنشاء.
      path: 'pending',
      data: img.bytes,
      mimeType: 'image/webp',
      width: img.width,
      height: img.height,
      bytes: img.bytes.byteLength,
      isPrimary,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
    select: { id: true },
  });
  await prisma.productImage.update({
    where: { id: created.id },
    data: { path: `/product-img/${created.id}` },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'product.update',
    entityType: 'ProductImage',
    entityId: created.id,
    detail: 'رفع صورة',
  });

  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/');
  return { ok: 'أُضيفت الصورة. ظاهرة على المنتج الآن.' };
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  const user = await requirePermission('products.write');

  const image = await prisma.productImage.findFirst({
    where: { id: imageId, product: { tenantId: user.tenantId } },
    select: { id: true, isPrimary: true },
  });
  if (!image) return;

  await prisma.productImage.deleteMany({
    where: { id: imageId, product: { tenantId: user.tenantId } },
  });

  // إن كانت الأساسية، تصير أقدم صورة باقية هي الأساسية — فلا يبقى المنتج
  // بلا صورة أساسية.
  if (image.isPrimary) {
    const next = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    if (next) await prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'product.update',
    entityType: 'ProductImage',
    entityId: imageId,
    detail: 'حذف صورة',
  });

  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/');
}

export async function setPrimaryImage(productId: string, imageId: string): Promise<void> {
  const user = await requirePermission('products.write');

  const owned = await prisma.productImage.findFirst({
    where: { id: imageId, product: { id: productId, tenantId: user.tenantId } },
    select: { id: true },
  });
  if (!owned) return;

  // أساسية واحدة فقط: تُصفَّر البقية ثم تُرفع هذه، في معاملة.
  await prisma.$transaction([
    prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } }),
    prisma.productImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ]);

  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/');
}

export async function moveProductImage(productId: string, imageId: string, dir: 'up' | 'down'): Promise<void> {
  const user = await requirePermission('products.write');

  const images = await prisma.productImage.findMany({
    where: { product: { id: productId, tenantId: user.tenantId } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const i = images.findIndex((x) => x.id === imageId);
  if (i === -1) return;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= images.length) return;

  await prisma.$transaction([
    prisma.productImage.update({ where: { id: images[i].id }, data: { sortOrder: j } }),
    prisma.productImage.update({ where: { id: images[j].id }, data: { sortOrder: i } }),
  ]);

  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/');
}

/**
 * إظهار/إخفاء المنتج على الموقع العام — محور مستقل عن حالة المنتج الداخلية.
 *
 * ما يظهر للزائر هو ما يوافق عليه المدير هنا. لا نشر ولا تعديل كود: القراءة
 * العامة تُصفّى على showOnSite، فالتبديل يظهر أو يختفي فوراً.
 */
export async function setShowOnSite(productId: string, show: boolean): Promise<void> {
  const user = await requirePermission('products.write');

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true, sku: true },
  });
  if (!product) return;

  await prisma.product.update({ where: { id: product.id }, data: { showOnSite: show } });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'product.showOnSite',
    entityType: 'Product',
    entityId: product.id,
    detail: `${product.sku} → ${show ? 'معروض' : 'مخفي'}`,
  });

  revalidatePath('/catalog/review');
  revalidatePath('/catalog/products');
  revalidatePath(`/catalog/products/${productId}`);
  revalidatePath('/products');
  revalidatePath('/');
}

// ── الأطقم/السيريات (توزيع مقاسات جاهز) ─────────────────────

/**
 * إنشاء سيريه/طقم للمنتج: اسم + كمية لكل مقاس.
 *
 * الحقول: bundleName، وحقل qty_<sizeId> لكل مقاس. المقاسات بكمية أكبر من صفر
 * تصير سطور الطقم. اللون لا يُخزَّن هنا — السيريه توزيع مقاسات، واللون يُختار
 * وقت البيع.
 */
export async function addBundle(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('products.write');

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId, isDeleted: false },
    select: { id: true },
  });
  if (!product) return { error: 'المنتج غير موجود.' };

  const nameAr = String(formData.get('bundleName') ?? '').trim();
  if (nameAr.length < 2) return { fieldErrors: { bundleName: 'اسم السيريه مطلوب.' } };

  const goodLines = await readBundleLines(formData, user.tenantId);
  if (goodLines === 'invalid') return { error: 'المقاسات المختارة غير صالحة.' };
  if (goodLines.length === 0) return { error: 'أدخل كمية لمقاس واحد على الأقل.' };

  const bundle = await prisma.productBundle.create({
    data: {
      tenantId: user.tenantId,
      productId: product.id,
      nameAr,
      cost: num(String(formData.get('bundleCost') ?? '')),
      price: num(String(formData.get('bundlePrice') ?? '')),
      lines: { create: goodLines },
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'bundle.create',
    entityType: 'ProductBundle',
    entityId: bundle.id,
    detail: `${nameAr} — ${goodLines.reduce((s, l) => s + l.quantity, 0)} قطعة`,
  });

  revalidatePath(`/catalog/products/${productId}`);
  return { ok: `أُنشئت السيريه «${nameAr}».` };
}

/**
 * تعديل سيريه قائمة: الاسم، تكلفة/سعر الدست، وتوزيع المقاسات — كلّها من داخل
 * صفحة المنتج بلا حذف وإعادة إنشاء. السطور تُستبدَل بالكامل بالمُدخَل الجديد
 * داخل معاملة، فيبقى المخزّن مطابقاً لما يراه المستخدم بالضبط.
 */
export async function updateBundle(
  productId: string,
  bundleId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('products.write');

  const bundle = await prisma.productBundle.findFirst({
    where: { id: bundleId, tenantId: user.tenantId, product: { id: productId } },
    select: { id: true },
  });
  if (!bundle) return { error: 'السيريه غير موجودة.' };

  const nameAr = String(formData.get('bundleName') ?? '').trim();
  if (nameAr.length < 2) return { fieldErrors: { bundleName: 'اسم السيريه مطلوب.' } };

  const goodLines = await readBundleLines(formData, user.tenantId);
  if (goodLines === 'invalid') return { error: 'المقاسات المختارة غير صالحة.' };
  if (goodLines.length === 0) return { error: 'أدخل كمية لمقاس واحد على الأقل.' };

  await tenantTransaction(async (tx) => {
    await tx.productBundleLine.deleteMany({ where: { bundleId: bundle.id } });
    await tx.productBundle.update({
      where: { id: bundle.id },
      data: {
        nameAr,
        cost: num(String(formData.get('bundleCost') ?? '')),
        price: num(String(formData.get('bundlePrice') ?? '')),
        lines: { create: goodLines },
      },
    });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'bundle.update',
    entityType: 'ProductBundle',
    entityId: bundle.id,
    detail: `${nameAr} — ${goodLines.reduce((s, l) => s + l.quantity, 0)} قطعة`,
  });

  revalidatePath(`/catalog/products/${productId}`);
  return { ok: `حُفظت السيريه «${nameAr}».` };
}

/**
 * يجمع سطور السيريه من حقول qty_<sizeId> ويتحقّق أن المقاسات لهذا المستأجر.
 * يُعيد المصفوفة الصالحة، أو 'invalid' حين لا يصمد أيّ مقاس مُدخَل (تلاعب في
 * المعرّفات) — نميّزها عن «لم يُدخَل شيء» (مصفوفة فارغة).
 */
async function readBundleLines(
  formData: FormData,
  tenantId: string,
): Promise<{ sizeId: string; quantity: number }[] | 'invalid'> {
  const lines: { sizeId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('qty_')) continue;
    const qty = Math.max(0, Math.round(Number(value) || 0));
    if (qty > 0) lines.push({ sizeId: key.slice(4), quantity: qty });
  }
  if (lines.length === 0) return [];

  const validSizes = await prisma.size.findMany({
    where: { id: { in: lines.map((l) => l.sizeId) }, tenantId, isDeleted: false },
    select: { id: true },
  });
  const validSet = new Set(validSizes.map((s) => s.id));
  const goodLines = lines.filter((l) => validSet.has(l.sizeId));
  return goodLines.length === 0 ? 'invalid' : goodLines;
}

/** حذف سيريه — مع سطورها (Cascade). */
export async function deleteBundle(productId: string, bundleId: string): Promise<void> {
  const user = await requirePermission('products.write');
  const bundle = await prisma.productBundle.findFirst({
    where: { id: bundleId, tenantId: user.tenantId, product: { id: productId } },
    select: { id: true, nameAr: true },
  });
  if (!bundle) return;
  await prisma.productBundle.delete({ where: { id: bundle.id } });
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'bundle.delete',
    entityType: 'ProductBundle',
    entityId: bundle.id,
    detail: bundle.nameAr,
  });
  revalidatePath(`/catalog/products/${productId}`);
}
