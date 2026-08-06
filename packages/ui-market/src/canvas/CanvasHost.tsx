'use client';

import { Suspense, lazy, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { usePrefersReducedMotion } from '@erp/motion';
import { resolveActiveScene, useSceneStore } from './scene-store';

const HeroWeaveScene = lazy(() =>
  import('../scenes/HeroWeaveScene').then((m) => ({ default: m.HeroWeaveScene })),
);

const IntroScene = lazy(() =>
  import('../intro/IntroScene').then((m) => ({ default: m.IntroScene })),
);

/** Probe device capability once, to pick a rung on the degradation ladder. */
function detectTier(): 'full' | 'reduced' | 'minimal' | 'static' {
  if (typeof window === 'undefined') return 'static';

  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return 'static';
  } catch {
    return 'static';
  }

  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 768;

  if (coarse && narrow && cores <= 4) return 'minimal';
  if (coarse || narrow || cores <= 4) return 'reduced';
  return 'full';
}

/**
 * The single persistent WebGL Canvas.
 *
 * Mounted once, fixed behind the page. Scene *content* swaps by scroll
 * position; the WebGL context never churns. One Canvas rather than one per
 * section because browsers cap concurrent contexts (~8–16) and each carries
 * real allocation cost (3d-websites playbook).
 *
 * Never mount this in a shared layout consumed by an ERP route — the ERP
 * must never pay for three.js (ADR-015).
 */
export function CanvasHost() {
  const desiredScene = useSceneStore((s) => s.desiredScene);
  const introActive = useSceneStore((s) => s.introActive);
  const activeScene = resolveActiveScene({ introActive, desiredScene });
  const tier = useSceneStore((s) => s.tier);
  const setTier = useSceneStore((s) => s.setTier);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setTier(detectTier());
  }, [setTier]);

  // STATIC rung: no WebGL at all. Art direction carries the section.
  if (tier === 'static' || activeScene === null) return null;

  const dpr: [number, number] = tier === 'full' ? [1, 2] : [1, 1.5];

  // The intro plays over the page, so the shared canvas rises above the
  // intro's backdrop for its duration, then drops back behind the content.
  // One context either way — never a second <Canvas> (3d-websites playbook).
  const isIntro = activeScene === 'intro';

  return (
    <div
      className={`pointer-events-none fixed inset-0 ${isIntro ? 'z-[100]' : '-z-10'}`}
      aria-hidden="true"
    >
      <Canvas
        dpr={dpr}
        gl={{ antialias: tier === 'full', alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, isIntro ? 14 : 12], fov: 45 }}
        // Render on demand under reduced motion: the scene still assembles
        // with scroll, but nothing animates on its own.
        frameloop={reducedMotion ? 'demand' : 'always'}
      >
        <Suspense fallback={null}>
          {activeScene === 'hero' && <HeroWeaveScene />}
          {isIntro && <IntroScene />}
        </Suspense>
      </Canvas>
    </div>
  );
}
