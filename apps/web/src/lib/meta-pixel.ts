/**
 * أحداث الإعلانات — Meta وجوجل وتيك توك معاً (بطلب المالك).
 *
 * المعرّفات يضبطها المدير من «أكواد التتبّع» في النظام (lib/tracking.ts)،
 * والمكوّن SiteTracking يكتب ما فُعّل منها في window.__trk قبل أي حدث. track()
 * يرسل الحدث بأسماء Meta المعيارية، ويترجمه لجوجل (GA4/Ads) وتيك توك تلقائياً.
 */

type Fn = (...args: unknown[]) => void;
interface TrackWindow {
  fbq?: Fn;
  gtag?: Fn;
  ttq?: { track: Fn; page: Fn };
  __trk?: { meta: boolean; google: boolean; tiktok: boolean; adsPurchase?: string; adsLead?: string };
}

/** اسم الحدث في GA4 / Google Ads وفي تيك توك لكل حدث Meta معياري. */
const MAP: Record<string, { google?: string; tiktok?: string }> = {
  ViewContent: { google: 'view_item', tiktok: 'ViewContent' },
  AddToCart: { google: 'add_to_cart', tiktok: 'AddToCart' },
  AddToWishlist: { google: 'add_to_wishlist', tiktok: 'AddToWishlist' },
  InitiateCheckout: { google: 'begin_checkout', tiktok: 'InitiateCheckout' },
  AddPaymentInfo: { google: 'add_payment_info', tiktok: 'AddPaymentInfo' },
  Purchase: { google: 'purchase', tiktok: 'CompletePayment' },
  Lead: { google: 'generate_lead', tiktok: 'SubmitForm' },
  CompleteRegistration: { google: 'sign_up', tiktok: 'CompleteRegistration' },
  Contact: { google: 'contact', tiktok: 'Contact' },
  CustomizeProduct: { google: 'customize_product' },
  Search: { google: 'search', tiktok: 'Search' },
};

/**
 * يرسل الحدث لكل منصّة مفعّلة. السكربتات تُحمَّل afterInteractive، فحدث يُطلق
 * عند فتح الصفحة (ViewContent) يسبقها — ننتظر كل منصّة قليلاً (~8 ثوانٍ) بدل
 * إسقاطه. eventId يطابق ما يرسله الخادم لـ Meta فيُعدّ الحدث مرة واحدة.
 */
export function track(event: string, params?: Record<string, unknown>, eventId?: string): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as TrackWindow;
  const on = w.__trk ?? { meta: true, google: false, tiktok: false };
  const map = MAP[event] ?? {};

  const send = (ready: () => boolean, fire: () => void, attempt = 0) => {
    if (ready()) return fire();
    if (attempt < 20) setTimeout(() => send(ready, fire, attempt + 1), 400);
  };

  if (on.meta) {
    send(() => !!w.fbq, () => w.fbq!('track', event, params, eventId ? { eventID: eventId } : undefined));
  }
  if (on.google && map.google) {
    const p = params ?? {};
    const ids = Array.isArray(p.content_ids) ? (p.content_ids as string[]) : [];
    send(() => !!w.gtag, () =>
      w.gtag!('event', map.google, {
        ...(p.value !== undefined ? { value: p.value, currency: p.currency } : {}),
        ...(ids.length ? { items: ids.map((id) => ({ item_id: id, item_name: p.content_name, quantity: p.num_items })) } : {}),
        ...(eventId ? { transaction_id: eventId } : {}),
      }),
    );
  }
  // Google Ads: الشراء وطلب عرض السعر يُسجَّلان «تحويلاً» بتسميتهما (send_to).
  const sendTo = event === 'Purchase' ? on.adsPurchase : event === 'Lead' ? on.adsLead : '';
  if (on.google && sendTo) {
    const p = params ?? {};
    send(() => !!w.gtag, () =>
      w.gtag!('event', 'conversion', {
        send_to: sendTo,
        ...(p.value !== undefined ? { value: p.value, currency: p.currency } : {}),
        ...(eventId ? { transaction_id: eventId } : {}),
      }),
    );
  }
  if (on.tiktok && map.tiktok) {
    send(() => !!w.ttq, () => w.ttq!.track(map.tiktok, params ?? {}, eventId ? { event_id: eventId } : undefined));
  }
}

/**
 * Meta لا تقبل الدينار العراقي (IQD) عملةً — يُرفض Purchase بلا عملةٍ صالحة.
 * فالقيمة تُرسَل بالدولار بسعر البنك المركزي الرسمي (1,310 دينار).
 */
export const META_CURRENCY = "USD";
export const IQD_PER_USD = 1310;
export function toMetaValue(iqd: number): number {
  return iqd > 0 ? Math.round((iqd / IQD_PER_USD) * 100) / 100 : 0;
}

/** أول رقمٍ في نص السعر («تطريز 15,000 IQD · …») — قيمةٌ تقريبية للإعلانات. */
export function priceFromText(text: string | undefined): number {
  const m = /(\d[\d,]*)/.exec(text ?? '');
  return m ? Number(m[1].replace(/,/g, '')) || 0 : 0;
}
