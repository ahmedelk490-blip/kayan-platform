import 'server-only';

import { cache } from 'react';
import { prisma } from './prisma';
import { setCurrentTenant } from './tenant-context';

/**
 * أكواد التتبّع والإعلانات — يتحكّم بها المدير من «الإدارة ← أكواد التتبّع».
 *
 * بطلب المالك: تغيير بكسل Meta وجوجل (Analytics / Tag Manager / Ads) وتيك توك
 * من النظام بلا نشر. تُحفظ في SiteContent (مجموعة tracking) فلا جدول جديد.
 * المعرّفات عامة (تظهر في HTML أي موقع)؛ رمز Conversions API السرّي يبقى في
 * متغيّر البيئة META_CAPI_TOKEN وحده ولا يُكتب هنا أبداً.
 */

const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

export interface TrackingIds {
  metaPixelId: string;
  ga4Id: string;
  gtmId: string;
  googleAdsId: string;
  /** «تسمية» تحويل الشراء في Google Ads (الجزء بعد / في send_to). */
  googleAdsPurchaseLabel: string;
  /** «تسمية» تحويل طلب عرض السعر / التواصل في Google Ads. */
  googleAdsLeadLabel: string;
  tiktokPixelId: string;
}

export const TRACKING_FIELDS: {
  name: keyof TrackingIds;
  label: string;
  placeholder: string;
  pattern: RegExp;
  help: string;
}[] = [
  {
    name: 'metaPixelId',
    label: 'بكسل Meta (فيسبوك وإنستغرام)',
    placeholder: '1657197319267168',
    pattern: /^\d{10,20}$/,
    help: 'مدير الأحداث ← مصادر البيانات ← البكسل ← الإعدادات. أرقام فقط.',
  },
  {
    name: 'ga4Id',
    label: 'Google Analytics 4',
    placeholder: 'G-XXXXXXXXXX',
    pattern: /^G-[A-Z0-9]{4,20}$/,
    help: 'Analytics ← المسؤول ← مصادر البيانات ← معرّف القياس (يبدأ بـ G-).',
  },
  {
    name: 'gtmId',
    label: 'Google Tag Manager',
    placeholder: 'GTM-XXXXXXX',
    pattern: /^GTM-[A-Z0-9]{4,12}$/,
    help: 'اختياري — إن كان عندكم حاوية Tag Manager (تبدأ بـ GTM-).',
  },
  {
    name: 'googleAdsId',
    label: 'إعلانات جوجل (Google Ads)',
    placeholder: 'AW-123456789',
    pattern: /^AW-\d{6,15}$/,
    help: 'Google Ads ← الأدوات ← التحويلات ← وسم Google (يبدأ بـ AW-).',
  },
  {
    name: 'googleAdsPurchaseLabel',
    label: 'Google Ads — تسمية تحويل «الشراء»',
    placeholder: 'AbC-D_efG-h12_34-567',
    pattern: /^[A-Za-z0-9_-]{6,40}$/,
    help: 'من إعداد التحويل: send_to: AW-123/«هذا الجزء». يُسجَّل مع كل طلب من السلّة.',
  },
  {
    name: 'googleAdsLeadLabel',
    label: 'Google Ads — تسمية تحويل «طلب عرض سعر»',
    placeholder: 'XyZ-1_abC-d23_45-678',
    pattern: /^[A-Za-z0-9_-]{6,40}$/,
    help: 'يُسجَّل مع كل طلب عرض سعر أو طلب من الموقع.',
  },
  {
    name: 'tiktokPixelId',
    label: 'بكسل تيك توك',
    placeholder: 'CXXXXXXXXXXXXXXXXXXX',
    pattern: /^[A-Z0-9]{15,25}$/,
    help: 'TikTok Ads ← الأصول ← الأحداث ← بكسل الويب ← معرّف البكسل.',
  },
];

export const trackingKey = (name: keyof TrackingIds) => `tracking.${name}`;

/** القيم الحالية؛ بكسل Meta الأصلي يبقى افتراضياً حتى يغيّره المدير أو يوقفه. */
const DEFAULTS: TrackingIds = {
  metaPixelId: '1657197319267168',
  ga4Id: '',
  gtmId: '',
  googleAdsId: '',
  googleAdsPurchaseLabel: '',
  googleAdsLeadLabel: '',
  tiktokPixelId: '',
};

/** معرّفات التتبّع لموقع المستأجر العام — مرة واحدة لكل طلب. */
export const trackingIds = cache(async (): Promise<TrackingIds> => {
  setCurrentTenant(PUBLIC_TENANT);
  try {
    const rows = await prisma.siteContent.findMany({
      where: { tenantId: PUBLIC_TENANT, group: 'tracking' },
      select: { key: true, valueAr: true },
    });
    const ids = { ...DEFAULTS };
    for (const f of TRACKING_FIELDS) {
      const row = rows.find((r) => r.key === trackingKey(f.name));
      // صفّ موجود يغلب الافتراضي — و«off» يعني أن المدير أوقفه عمداً.
      if (row) ids[f.name] = row.valueAr === 'off' ? '' : f.pattern.test(row.valueAr) ? row.valueAr : '';
    }
    return ids;
  } catch (error) {
    console.error('[tracking] تعذّر قراءة الأكواد', error);
    return DEFAULTS;
  }
});
