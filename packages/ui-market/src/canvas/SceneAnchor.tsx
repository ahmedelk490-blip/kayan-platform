'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { useScroll } from 'motion/react';
import { useSceneStore, type SceneId } from './scene-store';

interface SceneAnchorProps {
  scene: NonNullable<SceneId>;
  children?: ReactNode;
  className?: string;
  /** Scroll offset range mapped to scene progress 0→1. */
  offset?: [string, string];
}

/**
 * A DOM region that owns a 3D scene while it is on screen.
 *
 * Mounts the scene on approach and releases it on exit, which is what makes
 * "dynamic scene loading" real rather than nominal — the Canvas persists,
 * its contents do not.
 */
export function SceneAnchor({
  scene,
  children,
  className,
  offset = ['start start', 'end start'],
}: SceneAnchorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const setActiveScene = useSceneStore((s) => s.setActiveScene);
  const setProgress = useSceneStore((s) => s.setProgress);

  const { scrollYProgress } = useScroll({
    target: ref,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    offset: offset as any,
  });

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', setProgress);
    setProgress(scrollYProgress.get());
    return () => unsubscribe();
  }, [scrollYProgress, setProgress]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActiveScene(scene);
        } else {
          // Only clear if we still own the canvas — another anchor may have
          // claimed it as this one left.
          if (useSceneStore.getState().activeScene === scene) {
            setActiveScene(null);
          }
        }
      },
      // Load slightly before entry so the scene is ready when it is seen.
      { rootMargin: '25% 0px 25% 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [scene, setActiveScene]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
