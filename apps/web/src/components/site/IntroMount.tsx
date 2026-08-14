'use client';

import dynamic from 'next/dynamic';

/**
 * Client mount point for the opening signature.
 *
 * Dynamically imported for the same reason as CanvasHost: it carries the
 * three.js runtime, which must never sit in the initial bundle. `ssr: false`
 * because there is no server equivalent of a GL context.
 */
const BrandIntro = dynamic(() => import('@erp/ui-market/intro').then((m) => m.BrandIntro), {
  ssr: false,
});

export function IntroMount() {
  return <BrandIntro />;
}
