'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import type { Kind } from './types';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

const Base = z.object({
  nameAr: z.string().trim().min(1, 'الاسم مطلوب.').max(160),
  nameEn: z.string().trim().max(160).optional().or(z.literal('')),
  extra: z.string().trim().max(200).optional().or(z.literal('')),
  code: z.string().trim().max(60).optional().or(z.literal('')),
});

export async function createCatalogItem(
  kind: Kind,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('catalog.manage');
  const parsed = Base.safeParse({
    nameAr: String(formData.get('nameAr') ?? ''),
    nameEn: String(formData.get('nameEn') ?? ''),
    extra: String(formData.get('extra') ?? ''),
    code: String(formData.get('code') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { nameAr, nameEn, extra, code } = parsed.data;
  const tenantId = user.tenantId;

  try {
    switch (kind) {
      case 'categories': {
        const slug =
          (code || nameAr).toLowerCase().replace(/\s+/g, '-').replace(/[^\w؀-ۿ-]/g, '') ||
          `cat-${Date.now()}`;
        await prisma.category.create({
          data: { tenantId, slug, nameAr, nameEn: nameEn || nameAr },
        });
        break;
      }
      case 'colors':
        await prisma.color.create({ data: { tenantId, nameAr, nameEn: nameEn || null, hex: extra || null } });
        break;
      case 'sizes':
        if (!code) return { fieldErrors: { code: 'رمز المقاس مطلوب.' } };
        await prisma.size.create({ data: { tenantId, code, nameAr } });
        break;
      case 'materials':
        await prisma.material.create({ data: { tenantId, nameAr, nameEn: nameEn || null, spec: extra || null } });
        break;
      case 'printing':
        await prisma.printingOption.create({
          data: { tenantId, nameAr, nameEn: nameEn || null, notes: extra || null },
        });
        break;
      case 'embroidery':
        await prisma.embroideryOption.create({
          data: { tenantId, nameAr, nameEn: nameEn || null, notes: extra || null },
        });
        break;
    }
  } catch {
    // The unique constraint on (tenantId, nameAr) is the real guard; this
    // turns the violation into a readable message.
    return { error: 'هذا الاسم موجود بالفعل.' };
  }

  await audit({
    tenantId,
    userId: user.id,
    action: 'catalog.create',
    entityType: kind,
    detail: nameAr,
  });

  revalidatePath(`/catalog/${kind}`);
  return { ok: 'تمت الإضافة.' };
}

/** Soft delete — the row stays so products keep pointing at something real. */
export async function deleteCatalogItem(kind: Kind, id: string): Promise<void> {
  const user = await requirePermission('catalog.manage');
  const data = { isDeleted: true, deletedAt: new Date() };

  // المعرّف يصل من المتصفّح، فالشرط يحمل المستأجر معه.
  //
  // كان العزل في قاعدة البيانات يرفض الصفّ غير المملوك، فبدا التعديل
  // بالمعرّف وحده كافياً. وهو لم يكن كافياً قطّ — كان محروساً من تحت.
  // بزوال ذلك الحارس يصير هذا السطر هو الحارس.
  //
  // updateMany لا update: الثاني يرمي حين لا يجد، والأول يعدّل صفراً من
  // الصفوف بهدوء. وهو الصحيح هنا — من يرسل معرّف غيره لا يستحقّ رسالة
  // خطأ تخبره أن الصفّ موجود.
  const where = { id, tenantId: user.tenantId };

  switch (kind) {
    case 'categories':
      await prisma.category.updateMany({ where, data });
      break;
    case 'colors':
      await prisma.color.updateMany({ where, data });
      break;
    case 'sizes':
      await prisma.size.updateMany({ where, data });
      break;
    case 'materials':
      await prisma.material.updateMany({ where, data });
      break;
    case 'printing':
      await prisma.printingOption.updateMany({ where, data });
      break;
    case 'embroidery':
      await prisma.embroideryOption.updateMany({ where, data });
      break;
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'catalog.softDelete',
    entityType: kind,
    entityId: id,
  });

  revalidatePath(`/catalog/${kind}`);
}
