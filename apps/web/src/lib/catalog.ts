import 'server-only';

import { prisma } from './prisma';
import { setCurrentTenant } from './tenant-context';

/**
 * كتالوج المنتجات العام — من نفس جدول Product الذي يحرّره المدير.
 *
 * قبل هذا كانت المنتجات مكتوبة يدوياً في `site.ts`: الاسم والوصف والصور
 * وعددها. فتعديل المدير لمنتج في النظام لا يغيّر شيئاً على الموقع، وإضافة
 * منتج للموقع تحتاج تعديل كود ونشراً. مصدران لحقيقة واحدة.
 *
 * الآن مصدر واحد. ما يظهر هنا هو ما في قاعدة البيانات، لا نسخة عنه.
 *
 * ── لماذا يُعلَن المستأجر هنا ──────────────────────────────
 *
 * الصفحات العامة لا تمرّ بـ`requirePermission`، وهو الموضع الذي يخبر
 * قاعدة البيانات أي مستأجر تخدم. فبدون هذا السطر ترفض سياسات RLS كل صف
 * — بحق — ويظهر الموقع فارغاً. الإعلان هنا صريح ومحصور في القراءة العامة.
 */

/** المستأجر الذي يخدمه الموقع العام. */
const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

export interface PublicProduct {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  /** سعر البيع كنص — Decimal لا يعبر إلى مكوّن عميل. */
  sellingPrice: string | null;
  /** الصورة الأساسية، أو أول صورة، أو لا شيء. */
  image: string | null;
  imageCount: number;
  /** الألوان والمقاسات المتاحة فعلاً، من المتغيّرات غير المحذوفة. */
  colors: string[];
  sizes: string[];
  materials: string[];
  variantCount: number;
  /** شرائح السعر النشطة — الخدمة والكمية والسعر. */
  tiers: { service: string; minQty: number; maxQty: number | null; price: string; currency: string }[];
}

/**
 * المنتجات المعروضة للعامة.
 *
 * `status: ACTIVE` فقط. منتج أوقفه المدير يختفي من الموقع فوراً، وهذا هو
 * معنى أن يتحكّم من النظام: لا حاجة لأن يطلب من أحد تعديل الموقع.
 */
export async function publicProducts(): Promise<PublicProduct[]> {
  setCurrentTenant(PUBLIC_TENANT);

  try {
    return await queryProducts();
  } catch (error) {
    // قاعدة البيانات غير متاحة. الصفحة العامة تُعرض بلا منتجات بدل أن
    // تعطي 500: زائر يرى الموقع بلا كتالوج أفضل من زائر يرى صفحة خطأ.
    //
    // ليس التفافاً على المعمارية ولا قائمة بديلة مكتوبة في الكود — لا شيء
    // يُخترع هنا. الخطأ يُسجَّل كاملاً ليُرى، والصفحة تقول بصراحة إنها لا
    // تعرض منتجات الآن.
    console.error('[catalog] الكتالوج العام تعذّر قراءته من قاعدة البيانات', error);
    return [];
  }
}

async function queryProducts(): Promise<PublicProduct[]> {
  const rows = await prisma.product.findMany({
    where: { tenantId: PUBLIC_TENANT, isDeleted: false, status: 'ACTIVE' },
    orderBy: { sku: 'asc' },
    select: {
      id: true,
      sku: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      sellingPrice: true,
      images: {
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        select: { path: true },
      },
      variants: {
        where: { isDeleted: false },
        select: {
          color: { select: { nameAr: true } },
          size: { select: { code: true } },
        },
      },
      materials: { select: { material: { select: { nameAr: true } } } },
      priceTiers: {
        where: { isActive: true },
        orderBy: [{ service: 'asc' }, { minQty: 'asc' }],
        select: { service: true, minQty: true, maxQty: true, price: true, currency: true },
      },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    descriptionAr: p.descriptionAr,
    sellingPrice: p.sellingPrice ? p.sellingPrice.toString() : null,
    image: p.images[0]?.path ?? null,
    imageCount: p.images.length,
    // Set يزيل التكرار: عدة متغيّرات تشترك في اللون أو المقاس.
    colors: [...new Set(p.variants.map((v) => v.color?.nameAr).filter(Boolean))] as string[],
    sizes: [...new Set(p.variants.map((v) => v.size?.code).filter(Boolean))] as string[],
    materials: [...new Set(p.materials.map((m) => m.material.nameAr))],
    variantCount: p.variants.length,
    tiers: p.priceTiers.map((t) => ({
      service: t.service,
      minQty: t.minQty,
      maxQty: t.maxQty,
      price: t.price.toString(),
      currency: t.currency,
    })),
  }));
}

/**
 * رقم واتساب الموقع — من إعدادات الشركة.
 *
 * يعدّله المدير من شاشة الإعدادات فيظهر فوراً بلا نشر. فارغ يعني لا زر:
 * رقم مخترع أسوأ من غيابه، وزر يفتح محادثة مع لا أحد أسوأ منهما.
 */
export async function siteWhatsApp(): Promise<string | null> {
  setCurrentTenant(PUBLIC_TENANT);
  try {
    const company = await prisma.company.findFirst({
      where: { tenantId: PUBLIC_TENANT },
      select: { whatsapp: true },
    });
    // يُجرَّد من المسافات و+ والأقواس: wa.me يقبل الأرقام وحدها.
    const digits = (company?.whatsapp ?? '').replace(/\D/g, '');
    return digits.length >= 8 ? digits : null;
  } catch (error) {
    // قاعدة البيانات غير متاحة: لا زر، ولا صفحة خطأ.
    console.error('[site] تعذّر قراءة رقم الواتساب', error);
    return null;
  }
}