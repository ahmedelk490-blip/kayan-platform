'use server';

import { revalidatePath } from 'next/cache';
import { sizeRank } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

export interface SizeSortState {
  ok?: string;
  error?: string;
}

/**
 * ضبط ترتيب المقاسات القائمة، وإخفاء ما لم يعد يُباع منها.
 *
 * المقاسات المُدخَلة سابقاً كلّها بـ sortOrder صفر — لا شاشة تضبطه — فتظهر
 * بأي ترتيب تردّه القاعدة. هذه تكتب الترتيب المشتقّ من الرمز مرّةً واحدة،
 * فتستقيم كل قائمة تقرأه (الفواتير، المخزون، السيريات).
 *
 * والإخفاء حذفٌ ليّن: الصفّ يبقى فلا تُيتم فاتورةٌ قديمة تشير إليه،
 * ويغيب المقاس من قوائم الاختيار وحدها. وما يُخفى يُكتب في الخانة باليد،
 * فلا يختفي مقاسٌ لم يُطلَب إخفاؤه.
 */
export async function sortSizes(_prev: SizeSortState, formData: FormData): Promise<SizeSortState> {
  const user = await requirePermission('catalog.manage');

  const hideCodes = String(formData.get('hide') ?? '')
    .split(/[\s,،]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const sizes = await prisma.size.findMany({
    where: { tenantId: user.tenantId, isDeleted: false },
    select: { id: true, code: true, sortOrder: true },
  });
  if (sizes.length === 0) return { error: 'لا مقاسات مُسجّلة بعد.' };

  let reordered = 0;
  for (const s of sizes) {
    const rank = sizeRank(s.code);
    if (s.sortOrder !== rank) {
      await prisma.size.updateMany({ where: { id: s.id, tenantId: user.tenantId }, data: { sortOrder: rank } });
      reordered += 1;
    }
  }

  const toHide = sizes.filter((s) => hideCodes.includes(s.code.trim().toUpperCase()));
  for (const s of toHide) {
    await prisma.size.updateMany({
      where: { id: s.id, tenantId: user.tenantId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  const remaining = sizes
    .filter((s) => !toHide.some((h) => h.id === s.id))
    .sort((a, b) => sizeRank(a.code) - sizeRank(b.code))
    .map((s) => s.code);

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'catalog.sizes.sort',
    entityType: 'Size',
    entityId: user.tenantId,
    detail: `reordered ${reordered}, hidden ${toHide.map((h) => h.code).join(',') || 'none'}`,
  });

  revalidatePath('/catalog/sizes');
  revalidatePath('/inventory');
  revalidatePath('/admin');

  const hidden = toHide.length > 0 ? ` وأُخفي: ${toHide.map((h) => h.code).join('، ')}.` : '';
  return { ok: `الترتيب الآن: ${remaining.join(' ← ')}.${hidden}` };
}
