'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { META_PIXEL_ID, track } from '@/lib/meta-pixel';

/**
 * كود Meta Pixel الأساسي + PageView لكل صفحة. الموقع يتنقّل بلا إعادة تحميل،
 * فالكود الأساسي يحسب الصفحة الأولى وحدها؛ وما بعدها يُحسب هنا عند تغيّر المسار.
 */
export function MetaPixel() {
  const path = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    track('PageView');
  }, [path]);

  if (!META_PIXEL_ID) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

/** ViewContent لصفحة منتج — يُرسَل مرة عند فتحها. */
export function TrackViewContent({ id, name }: { id: string; name: string }) {
  useEffect(() => {
    track('ViewContent', { content_ids: [id], content_name: name, content_type: 'product' });
  }, [id, name]);
  return null;
}
