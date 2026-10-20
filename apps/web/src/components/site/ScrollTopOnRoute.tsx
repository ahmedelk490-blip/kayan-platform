'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * كل صفحة جديدة تبدأ من أعلاها.
 *
 * بطلب المالك: الضغط على منتج كان يفتح صفحته من آخرها. السبب أن التمرير
 * الناعم (Lenis) يحفظ موضعه الداخلي ويعيد الصفحة الجديدة إليه؛ فعند تغيّر
 * المسار نصفّره هو والمتصفح معاً. روابط #قسم تبقى كما هي.
 */
export function ScrollTopOnRoute() {
  const path = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.location.hash) return;
    const lenis = (window as unknown as { __lenis?: { scrollTo: (t: number, o?: object) => void } }).__lenis;
    lenis?.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
  }, [path]);

  return null;
}
