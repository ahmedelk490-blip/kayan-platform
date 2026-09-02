import { requirePermission } from '@/lib/guard';
import { latestBackup } from '@/lib/backup';

/**
 * تنزيل أحدث نسخة احتياطية — نسخة بيد المالك خارج الخادم كله.
 *
 * النسخ تعيش في مجلد على الخادم؛ لو ضاع الخادم ضاعت معه. هذا المسار يسلّم
 * أحدث ملف (JSON مضغوط) لمن يملك صلاحية الإدارة، فيحفظه على جهازه.
 */
export async function GET(): Promise<Response> {
  await requirePermission('admin.view');

  const backup = await latestBackup();
  if (!backup) {
    return new Response('لا توجد نسخة بعد — اضغط «نسخة احتياطية الآن» من شاشة الإدارة أولاً.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(new Uint8Array(backup.data), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${backup.name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
