'use server';

import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * إدارة شرائح واجهة الصفحة الرئيسية.
 *
 * الصورة تُعالَج بـ sharp قبل تخزينها: تُحوَّل webp وتُقلَّص إلى عرض معقول.
 * هذا يفعل ثلاثة أشياء دفعة واحدة — يوحّد الصيغة فيبسّط المسار الذي يقدّمها،
 * ويقصّ حجم البايتات التي ستعيش في القاعدة، ويعزل الرفع عن أي ملف خبيث:
 * sharp يفكّ الصورة ويعيد ترميزها، فما يُخزَّن صورة أنتجناها نحن لا ملفاً
 * وصل كما هو.
 *
 * ولماذا في القاعدة لا على القرص: القرص يُمسح مع كل نشر على الاستضافة
 * المشتركة. صورة على القرص تضيع أول تحديث؛ بايتات في القاعدة تبقى.
 */

/** أقصى حجم ملف مقبول قبل المعالجة — قبل sharp لا بعده. */
const MAX_UPLOAD = 8 * 1024 * 1024; // 8MB

/** أقصى عرض بعد المعالجة. أوسع من هذا لا يضيف للواجهة إلا وزناً. */
const MAX_WIDTH = 1400;

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const TextSchema = z.object({
  title: z.string().trim().min(1, 'الاسم مطلوب.').max(120, 'الاسم أطول من اللازم.'),
  subtitle: z.string().trim().max(160, 'السطر الثاني أطول من اللازم.').default(''),
});

/**
 * يقرأ الملف من النموذج ويعيد صورة webp معالَجة مع أبعادها.
 *
 * يعيد رسالة خطأ نصية بدل الرمي: الأخطاء هنا مدخلات مستخدم لا أعطال، فتُعرض
 * له كما هي — «ليست صورة»، «أكبر من اللازم» — لا صفحة خطأ.
 */
async function processImage(
  file: unknown,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; width: number; height: number } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'اختر صورة.' };
  }
  if (file.size > MAX_UPLOAD) {
    return { error: 'الصورة أكبر من 8 ميجابايت. اختر صورة أصغر.' };
  }
  if (file.type && !ACCEPTED.has(file.type)) {
    return { error: 'الصيغة غير مدعومة. استخدم JPG أو PNG أو WebP.' };
  }

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const pipeline = sharp(input, { failOn: 'error' })
      // rotate() بلا وسيط يطبّق دوران EXIF: صورة من الهاتف مقلوبة تُعتدل.
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    // Prisma's Bytes wants Uint8Array<ArrayBuffer>; sharp returns a Node
    // Buffer over ArrayBufferLike, and `new Uint8Array(buffer)` inherits that
    // wider backing type. Allocating by length gives a fresh ArrayBuffer, and
    // set() copies the pixels in — the exact type the client expects.
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    return { bytes, width: info.width, height: info.height };
  } catch {
    // sharp يرمي حين لا يفهم الملف — وهو تماماً ما نريد رفضه: ملف يدّعي
    // أنه صورة وليس كذلك.
    return { error: 'تعذّرت قراءة الملف كصورة. تأكّد أنه صورة سليمة.' };
  }
}

export async function createSlide(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('settings.manage');

  const parsed = TextSchema.safeParse({
    title: String(formData.get('title') ?? ''),
    subtitle: String(formData.get('subtitle') ?? ''),
  });
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      ),
    };
  }

  const img = await processImage(formData.get('image'));
  if ('error' in img) return { fieldErrors: { image: img.error } };

  // الشريحة الجديدة تذهب إلى آخر الترتيب.
  const last = await prisma.heroSlide.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const created = await prisma.heroSlide.create({
    data: {
      tenantId: user.tenantId,
      title: parsed.data.title,
      subtitle: parsed.data.subtitle,
      image: img.bytes,
      mimeType: 'image/webp',
      width: img.width,
      height: img.height,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      isActive: true,
    },
    select: { id: true },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'hero-slide.create',
    entityType: 'HeroSlide',
    entityId: created.id,
    detail: parsed.data.title,
  });

  revalidatePath('/content/hero');
  revalidatePath('/');
  return { ok: 'أُضيفت الشريحة. ظاهرة على الواجهة الآن.' };
}

export async function updateSlideText(
  slideId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('settings.manage');

  const parsed = TextSchema.safeParse({
    title: String(formData.get('title') ?? ''),
    subtitle: String(formData.get('subtitle') ?? ''),
  });
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      ),
    };
  }

  // الصورة اختيارية في التعديل: نص وحده يُحدَّث، وصورة تُستبدل إن رُفعت.
  const raw = formData.get('image');
  let imagePatch: { image: Uint8Array<ArrayBuffer>; width: number; height: number } | undefined;
  if (raw instanceof File && raw.size > 0) {
    const img = await processImage(raw);
    if ('error' in img) return { fieldErrors: { image: img.error } };
    imagePatch = { image: img.bytes, width: img.width, height: img.height };
  }

  const updated = await prisma.heroSlide.updateMany({
    where: { id: slideId, tenantId: user.tenantId },
    data: {
      title: parsed.data.title,
      subtitle: parsed.data.subtitle,
      ...(imagePatch ? { image: imagePatch.image, width: imagePatch.width, height: imagePatch.height } : {}),
    },
  });
  if (updated.count === 0) return { error: 'الشريحة غير موجودة.' };

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'hero-slide.update',
    entityType: 'HeroSlide',
    entityId: slideId,
    detail: imagePatch ? `${parsed.data.title} · صورة جديدة` : parsed.data.title,
  });

  revalidatePath('/content/hero');
  revalidatePath('/');
  return { ok: imagePatch ? 'حُدّثت الشريحة وصورتها.' : 'حُدّث نص الشريحة.' };
}

export async function toggleSlide(slideId: string, active: boolean): Promise<void> {
  const user = await requirePermission('settings.manage');
  const updated = await prisma.heroSlide.updateMany({
    where: { id: slideId, tenantId: user.tenantId },
    data: { isActive: active },
  });
  if (updated.count === 0) return;

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: active ? 'hero-slide.activate' : 'hero-slide.deactivate',
    entityType: 'HeroSlide',
    entityId: slideId,
  });

  revalidatePath('/content/hero');
  revalidatePath('/');
}

/**
 * ينقل شريحة خطوة واحدة أعلى أو أسفل بتبديل ترتيبها مع جارتها.
 *
 * التبديل لا إعادة الترقيم الكاملة: عمليتان تكفيان، والقيم قد تكون متساوية
 * أو متفرّقة فلا يُعتمد على تسلسلها. الجارة تُختار من نفس المستأجر وحده.
 */
export async function moveSlide(slideId: string, direction: 'up' | 'down'): Promise<void> {
  const user = await requirePermission('settings.manage');

  const slides = await prisma.heroSlide.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, sortOrder: true },
  });

  const index = slides.findIndex((s) => s.id === slideId);
  if (index === -1) return;
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= slides.length) return; // على الطرف بالفعل

  const a = slides[index];
  const b = slides[swapWith];

  // القيم قد تتساوى، فالتبديل المباشر لا يفرّقهما. تُسنَد رتب صريحة من
  // الترتيب المعروض: a يأخذ مكان b والعكس.
  await prisma.$transaction([
    prisma.heroSlide.updateMany({ where: { id: a.id, tenantId: user.tenantId }, data: { sortOrder: swapWith } }),
    prisma.heroSlide.updateMany({ where: { id: b.id, tenantId: user.tenantId }, data: { sortOrder: index } }),
  ]);

  revalidatePath('/content/hero');
  revalidatePath('/');
}

export async function deleteSlide(slideId: string): Promise<void> {
  const user = await requirePermission('settings.manage');

  const slide = await prisma.heroSlide.findFirst({
    where: { id: slideId, tenantId: user.tenantId },
    select: { title: true },
  });
  if (!slide) return;

  // شريحة الواجهة ليست بيانات محاسبية — لا تاريخ يشير إليها، فتُحذف فعلاً
  // لا تُخفى. الحذف يحرّر بايتاتها من القاعدة.
  await prisma.heroSlide.deleteMany({ where: { id: slideId, tenantId: user.tenantId } });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'hero-slide.delete',
    entityType: 'HeroSlide',
    entityId: slideId,
    detail: slide.title,
  });

  revalidatePath('/content/hero');
  revalidatePath('/');
}
