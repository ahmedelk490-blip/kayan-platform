'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { track } from '@/lib/meta-pixel';

export interface SiteTrackingIds {
  metaPixelId: string;
  ga4Id: string;
  gtmId: string;
  googleAdsId: string;
  googleAdsPurchaseLabel: string;
  googleAdsLeadLabel: string;
  tiktokPixelId: string;
}

/**
 * أكواد التتبّع على الموقع — Meta وجوجل (Analytics / Ads / Tag Manager) وتيك توك.
 *
 * المعرّفات تأتي من «أكواد التتبّع» في النظام (lib/tracking.ts) فيغيّرها المدير
 * بلا نشر؛ ما كان فارغاً لا يُحمَّل. المعرّفات مُتحقَّق منها بنمط صارم على الخادم
 * قبل أن تصل هنا، فلا تُحقن قيمة عشوائية في سكربت.
 *
 * الموقع يتنقّل بلا إعادة تحميل: الكود الأساسي يحسب الصفحة الأولى، وما بعدها
 * يُحسب هنا عند تغيّر المسار (GA4 يلتقطه وحده من سجلّ المتصفح).
 */
export function SiteTracking({ ids }: { ids: SiteTrackingIds }) {
  const path = usePathname();
  const first = useRef(true);
  const google = ids.ga4Id || ids.googleAdsId;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (ids.metaPixelId) track('PageView');
    const ttq = (window as unknown as { ttq?: { page: () => void } }).ttq;
    if (ids.tiktokPixelId) ttq?.page();
  }, [path, ids.metaPixelId, ids.tiktokPixelId]);

  const flags = JSON.stringify({
    meta: !!ids.metaPixelId,
    google: !!google,
    tiktok: !!ids.tiktokPixelId,
    // تحويلات Google Ads: send_to = AW-…/التسمية — فارغة ⇒ لا تحويل.
    adsPurchase: ids.googleAdsId && ids.googleAdsPurchaseLabel ? `${ids.googleAdsId}/${ids.googleAdsPurchaseLabel}` : '',
    adsLead: ids.googleAdsId && ids.googleAdsLeadLabel ? `${ids.googleAdsId}/${ids.googleAdsLeadLabel}` : '',
  });

  return (
    <>
      {/* أيّ منصّة مفعّلة — يقرؤها track() قبل إرسال أي حدث. */}
      <script dangerouslySetInnerHTML={{ __html: `window.__trk=${flags};` }} />

      {ids.metaPixelId && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(ids.metaPixelId)});fbq('track','PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${ids.metaPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {google && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${google}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());${[ids.ga4Id, ids.googleAdsId]
              .filter(Boolean)
              .map((id) => `gtag('config',${JSON.stringify(id)});`)
              .join('')}`}
          </Script>
        </>
      )}

      {ids.gtmId && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(ids.gtmId)});`}
        </Script>
      )}

      {ids.tiktokPixelId && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${JSON.stringify(ids.tiktokPixelId)});ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
    </>
  );
}

/** ViewContent لصفحة منتج — يُرسَل مرة عند فتحها (لكل المنصّات المفعّلة). */
export function TrackViewContent({ id, name }: { id: string; name: string }) {
  useEffect(() => {
    track('ViewContent', { content_ids: [id], content_name: name, content_type: 'product' });
  }, [id, name]);
  return null;
}
