import type { Metadata } from 'next';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { Note } from '@/components/crud/Note';
import { TRACKING_FIELDS, trackingIds } from '@/lib/tracking';
import { TrackingForm } from './TrackingForm';

export const metadata: Metadata = { title: 'أكواد التتبّع' };
export const dynamic = 'force-dynamic';

/**
 * أكواد التتبّع والإعلانات — بطلب المالك: يغيّر بكسل Meta وجوجل (Analytics /
 * Tag Manager / Ads وتحويلاتها) وتيك توك بنفسه، ويظهر التغيير على الموقع فوراً.
 */
export default async function TrackingPage() {
  const user = await requirePermission('settings.manage');
  const ids = await trackingIds();
  const capiLinked = Boolean(process.env.META_CAPI_TOKEN);

  return (
    <AppShell user={user} title="أكواد التتبّع">
      <ModuleHeader title="أكواد التتبّع والإعلانات" />

      <Note>
        الصق المعرّف من حساب الإعلانات واحفظ — يعمل على كل صفحات الموقع فوراً بلا نشر. اترك الحقل
        فارغاً لإيقاف المنصّة. أحداث الموقع (مشاهدة منتج، السلّة، الطلب، طلب عرض السعر، واتساب) تُرسل
        تلقائياً لكل منصّة مفعّلة، وتحويلات Google Ads تُسجَّل مع الطلب وطلب عرض السعر حين تُضاف تسمياتها.
      </Note>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card-2 px-4 py-3 text-xs text-txt-2">
        <span className="font-medium text-txt">Meta — إرسال الطلبات من الخادم (Conversions API):</span>
        {capiLinked ? (
          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-ok">مربوط ✓</span>
        ) : (
          <span className="rounded-full bg-card px-2 py-0.5 text-txt-4">غير مربوط</span>
        )}
        <span className="text-txt-3">رمزه سرّي فيُضاف في Hostinger باسم META_CAPI_TOKEN، لا هنا.</span>
      </div>

      <TrackingForm
        fields={TRACKING_FIELDS.map((f) => ({
          name: f.name,
          label: f.label,
          placeholder: f.placeholder,
          help: f.help,
          value: ids[f.name],
        }))}
      />
    </AppShell>
  );
}
