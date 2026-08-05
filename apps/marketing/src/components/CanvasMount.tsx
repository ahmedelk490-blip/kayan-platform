'use client';

import dynamic from 'next/dynamic';

/**
 * Client-side mount point for the persistent WebGL Canvas.
 *
 * The three.js / R3F runtime is ~290 kB and must never sit in the initial
 * bundle — a visitor has to be able to read the value proposition before any
 * WebGL is fetched (07_UI_UX §8). `ssr: false` because there is no server
 * equivalent of a GL context, and this wrapper exists because `next/dynamic`
 * with `ssr: false` is not permitted inside a Server Component.
 */
const CanvasHost = dynamic(
  () => import('@erp/ui-market/canvas').then((m) => m.CanvasHost),
  { ssr: false },
);

export function CanvasMount() {
  return <CanvasHost />;
}
