import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { contentDefaults } from '@/lib/content';
import { ContentForm, type ContentRow } from './ContentForm';
import { saveContent } from './actions';

export const metadata: Metadata = { title: 'نصوص الموقع' };

/**
 * تحرير نصوص الموقع العام.
 *
 * المفاتيح ثابتة في الكود والقيم في قاعدة البيانات، فالشاشة تعرض ما هو
 * معرَّف فعلاً — لا حقل بلا مكان يظهر فيه، ولا نص على الموقع بلا حقل يحرّره.
 */
export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const user = await requirePermission('settings.manage');

  const defaults = contentDefaults();
  const stored = await prisma.siteContent.findMany({
    where: { tenantId: user.tenantId },
    select: { key: true, valueAr: true },
  });
  const byKey = new Map(stored.map((s) => [s.key, s.valueAr]));

  const rows: ContentRow[] = defaults.map((d) => ({
    key: d.key,
    label: d.label,
    group: d.group,
    value: byKey.get(d.key) ?? d.valueAr,
    isCustom: byKey.has(d.key),
  }));

  return (
    <AppShell user={user} title="نصوص الموقع">
      <ModuleHeader
        title={`نصوص الموقع — ${rows.length} نصاً`}
        action={
          <Link href="/content/hero" className="erp-btn-ghost">
            صور الواجهة (سلايدر)
          </Link>
        }
      />
      <div className="max-w-4xl">
        <ContentForm action={saveContent} rows={rows} />
      </div>
    </AppShell>
  );
}
