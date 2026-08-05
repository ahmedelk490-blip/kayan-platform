'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@erp/utils';
import { usePrefersReducedMotion } from '@erp/motion';

interface MagneticButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: 'solid' | 'outline';
  className?: string;
  strength?: number;
}

/**
 * Button that leans toward the cursor.
 *
 * Reworked from the `noir-parfum` MagneticButton: brand-neutral styling, an
 * anchor variant, pointer-type detection, and a reduced-motion bypass. The
 * transform is written straight to the node rather than through state — a
 * re-render per pointer-move is wasteful and janky.
 */
export function MagneticButton({
  children,
  href,
  onClick,
  variant = 'solid',
  className,
  strength = 0.35,
}: MagneticButtonProps) {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reducedMotion) return;

    // Magnetism is meaningless without a hovering pointer.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;

    const onPointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const x = event.clientX - (rect.left + rect.width / 2);
        const y = event.clientY - (rect.top + rect.height / 2);
        node.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
      });
    };

    const onPointerLeave = () => {
      cancelAnimationFrame(frame);
      node.style.transform = 'translate3d(0, 0, 0)';
    };

    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerleave', onPointerLeave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [reducedMotion, strength]);

  const classes = cn(
    'group relative inline-flex items-center justify-center gap-2',
    'rounded-full px-7 py-3.5 text-sm font-medium tracking-wide',
    'transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
    'will-change-transform',
    // Focus must clear AA contrast against every background, including 3D.
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    variant === 'solid'
      ? 'bg-accent text-steel-950 hover:bg-hivis-400'
      : 'border border-steel-600 text-steel-100 hover:border-accent hover:text-accent',
    className,
  );

  if (href) {
    return (
      <a ref={ref as React.RefObject<HTMLAnchorElement>} href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      className={classes}
    >
      {children}
    </button>
  );
}
