'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { runBackup } from '@/lib/backup';

/** نسخة احتياطية فورية بضغطة من شاشة الإدارة — فوق النسخ اليومي التلقائي. */
export async function runBackupNow(): Promise<void> {
  const user = await requirePermission('admin.view');
  const result = await runBackup();
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'backup.manual',
    entityType: 'System',
    entityId: 'backup',
    detail: `${result.tables} جدول · ${result.rows} صف`,
  });
  revalidatePath('/admin');
}
