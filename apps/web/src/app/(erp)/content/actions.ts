'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { contentDefaults } from '@/lib/content';

export interface FormState {
  error?: string;
  ok?: string;
}

/**
 * تحرير نصوص الموقع.
 *
 * صف واحد لكل نص، والمفاتيح ثابتة في الكود. لا يُنشئ المدير مفتاحاً جديداً
 * من هنا: مفتاح لا يقرأه أي مكوّن نص يُكتب ولا يُعرض، وهو أسوأ من غيابه.
 */
export async function saveContent(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('settings.manage');

  // المفاتيح المسموحة هي المعرّفة في الكود وحدها.
  const allowed = new Map(contentDefaults().map((d) => [d.key, d]));

  const changes: { key: string; valueAr: string }[] = [];
  for (const [field, raw] of formData.entries()) {
    if (!field.startsWith('c:')) continue;
    const key = field.slice(2);
    const def = allowed.get(key);
    if (!def) continue;

    const valueAr = String(raw).trim();
    // نص فارغ يعني «أرجِعه لقيمة الكود» لا «افرغ الصفحة».
    if (valueAr.length === 0) {
      await prisma.siteContent.deleteMany({ where: { tenantId: user.tenantId, key } });
      continue;
    }
    if (valueAr.length > 2000) return { error: `النص «${def.label}» أطول من 2000 حرف.` };
    changes.push({ key, valueAr });
  }

  for (const c of changes) {
    const def = allowed.get(c.key)!;
    const existing = await prisma.siteContent.findFirst({
      where: { tenantId: user.tenantId, key: c.key },
      select: { id: true },
    });
    if (existing) {
      await prisma.siteContent.update({ where: { id: existing.id }, data: { valueAr: c.valueAr } });
    } else {
      await prisma.siteContent.create({
        data: {
          tenantId: user.tenantId,
          key: c.key,
          valueAr: c.valueAr,
          group: def.group,
          label: def.label,
        },
      });
    }
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'site-content.save',
    entityType: 'SiteContent',
    detail: `${changes.length} نصاً`,
  });

  revalidatePath('/content');
  revalidatePath('/');
  return { ok: `حُفظ ${changes.length} نصاً. التغيير ظاهر على الموقع الآن.` };
}
