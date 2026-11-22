import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { audit } from '@/lib/audit';
import { pricingSettings, savePricingSettings, type SellMode, type CostMode } from '@/lib/pricing';

export const metadata: Metadata = { title: 'إعدادات الأسعار' };

async function save(formData: FormData) {
  'use server';
  const user = await requirePermission('settings.manage');
  const sell: SellMode = formData.get('sell') === 'old' ? 'old' : 'new';
  const cost: CostMode = formData.get('cost') === 'newest' ? 'newest' : 'oldest';
  await savePricingSettings(user.tenantId, sell, cost);
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'pricing.settings', entityType: 'SiteContent', entityId: null, detail: `${sell}/${cost}` });
  revalidatePath('/content/pricing');
  revalidatePath('/cashier');
  revalidatePath('/invoices/new');
}

const OPTION =
  'flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-card px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft';

/**
 * إعدادات الأسعار — المدير يختار بأي سعر يبيع الكاشير والفاتورة (القديم أو
 * الجديد)، ومن أي دفعة تُحسب تكلفة البضاعة (الأقدم أو الأحدث). الأرباح تُحسب
 * من التكلفة المحفوظة على كل فاتورة، فتغيير الإعداد لا يمسّ فواتير مضت.
 */
export default async function PricingPage() {
  const user = await requirePermission('settings.manage');
  const s = await pricingSettings(user.tenantId);
  return (
    <AppShell user={user} title="إعدادات الأسعار">
      <ModuleHeader title="إعدادات الأسعار" />
      <form action={save} className="erp-card max-w-3xl space-y-6 p-6">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-brand">سعر البيع في الكاشير والفاتورة</legend>
          <label className={OPTION}>
            <input type="radio" name="sell" value="new" defaultChecked={s.sell === 'new'} className="mt-1" />
            <span className="text-sm leading-[1.8] text-txt-2">
              <strong className="text-txt">السعر الجديد</strong> — سعر البيع الحالي في بطاقة المنتج.
            </span>
          </label>
          <label className={OPTION}>
            <input type="radio" name="sell" value="old" defaultChecked={s.sell === 'old'} className="mt-1" />
            <span className="text-sm leading-[1.8] text-txt-2">
              <strong className="text-txt">السعر القديم</strong> — السعر قبل آخر تغيير في بطاقة المنتج (إن لم
              يتغيّر سعر الموديل قط يُستخدم الحالي).
            </span>
          </label>
          <p className="text-xs text-txt-4">البائع يقدر يعدّل السعر بيده في الفاتورة كالمعتاد — هذا ما يُملأ تلقائياً فقط.</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-brand">تكلفة البضاعة المباعة (للربح)</legend>
          <label className={OPTION}>
            <input type="radio" name="cost" value="oldest" defaultChecked={s.cost === 'oldest'} className="mt-1" />
            <span className="text-sm leading-[1.8] text-txt-2">
              <strong className="text-txt">الأقدم أولاً</strong> — القطع تُحسب من الدفعة القديمة بسعرها حتى تخلص،
              ثم الجديدة.
            </span>
          </label>
          <label className={OPTION}>
            <input type="radio" name="cost" value="newest" defaultChecked={s.cost === 'newest'} className="mt-1" />
            <span className="text-sm leading-[1.8] text-txt-2">
              <strong className="text-txt">الأحدث أولاً</strong> — القطع تُحسب من آخر دفعة دخلت بسعرها.
            </span>
          </label>
          <p className="text-xs text-txt-4">
            التكلفة تُحفظ على كل فاتورة لحظة إصدارها، فتغيير هذا الإعداد يسري على الفواتير الجديدة فقط ولا
            يغيّر أرباح ما مضى. والمصروفات لا تتأثر بأي منهما.
          </p>
        </fieldset>

        <button type="submit" className="erp-btn">
          حفظ الإعدادات
        </button>
      </form>
    </AppShell>
  );
}
