'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { TRACKING_FIELDS, trackingKey } from '@/lib/tracking';

export interface TrackingFormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * حفظ أكواد التتبّع. كل قيمة تُتحقَّق بنمطها (أرقام البكسل، G-…، AW-…) قبل
 * الحفظ — فلا تُحقن قيمة عشوائية في سكربت على الموقع. الحقل الفارغ يعني
 * «أوقف هذه المنصّة» ويُحفظ «off» حتى لا يعود الافتراضي من الكود.
 */
export async function saveTracking(_prev: TrackingFormState, formData: FormData): Promise<TrackingFormState> {
  const user = await requirePermission('settings.manage');

  const fieldErrors: Record<string, string> = {};
  const values: { key: string; value: string; label: string }[] = [];
  for (const f of TRACKING_FIELDS) {
    const raw = String(formData.get(f.name) ?? '').trim();
    if (raw && !f.pattern.test(raw)) {
      fieldErrors[f.name] = `الصيغة غير صحيحة — مثال: ${f.placeholder}`;
      continue;
    }
    values.push({ key: trackingKey(f.name), value: raw || 'off', label: f.label });
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  for (const v of values) {
    await prisma.siteContent.upsert({
      where: { tenantId_key: { tenantId: user.tenantId, key: v.key } },
      update: { valueAr: v.value },
      create: { tenantId: user.tenantId, key: v.key, valueAr: v.value, group: 'tracking', label: v.label },
    });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'site-content.save',
    entityType: 'SiteContent',
    detail: `أكواد التتبّع: ${values.map((v) => `${v.key.replace('tracking.', '')}=${v.value}`).join('، ')}`.slice(0, 1900),
  });

  // كل صفحات الموقع تحمل الأكواد في تخطيطها.
  revalidatePath('/', 'layout');
  revalidatePath('/content/tracking');
  return { ok: 'حُفظت الأكواد. تعمل على الموقع الآن.' };
}
