'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

/** يولّد مفتاح «ربط Claude» جديداً — القديم يتوقّف فوراً. */
export async function rotateClaudeKey(): Promise<void> {
  const user = await requirePermission('settings.manage');
  const value = randomBytes(24).toString('base64url');
  await prisma.siteContent.upsert({
    where: { tenantId_key: { tenantId: user.tenantId, key: 'claude_mcp_key' } },
    update: { valueAr: value },
    create: { tenantId: user.tenantId, key: 'claude_mcp_key', valueAr: value, group: 'claude', label: 'مفتاح ربط Claude' },
  });
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'claude.key', entityType: 'SiteContent', entityId: null, detail: 'rotated' });
  revalidatePath('/content/claude');
}

/** يوقف الربط تماماً. */
export async function disableClaudeKey(): Promise<void> {
  const user = await requirePermission('settings.manage');
  await prisma.siteContent.deleteMany({ where: { tenantId: user.tenantId, key: 'claude_mcp_key' } });
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'claude.key', entityType: 'SiteContent', entityId: null, detail: 'disabled' });
  revalidatePath('/content/claude');
}
