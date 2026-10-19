/**
 * Meta Pixel — لربط إعلانات فيسبوك وإنستغرام بما يحدث في الموقع (بطلب المالك).
 *
 * المعرّف يُكتب هنا مرة واحدة؛ وفارغاً لا يُحمَّل شيء ولا تُرسَل أحداث. والأحداث
 * معيارية فيفهمها مدير الإعلانات دون إعداد: PageView، ViewContent، AddToCart،
 * AddToWishlist، InitiateCheckout، وPurchase + Lead عند إتمام الطلب.
 */
export const META_PIXEL_ID = '1657197319267168';

type Fbq = (
  command: 'track',
  event: string,
  params?: Record<string, unknown>,
  options?: { eventID: string },
) => void;

/**
 * يرسل حدثاً معيارياً إن كان البكسل محمّلاً — وإلا لا شيء. eventId يطابق ما
 * يرسله الخادم بواجهة التحويلات للحدث نفسه، فتعدّه Meta مرة واحدة.
 */
export function track(event: string, params?: Record<string, unknown>, eventId?: string): void {
  if (typeof window === 'undefined' || !META_PIXEL_ID) return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  fbq?.('track', event, params, eventId ? { eventID: eventId } : undefined);
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
