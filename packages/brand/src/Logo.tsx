'use client';

import { useState } from 'react';
import { BRAND, LOGO } from './index';

/**
 * The official KAYAN logo.
 *
 * ⚠ DELIBERATE EXCEPTION to ADR-015 (components are never shared between
 * ui-market and ui-erp). The logo lives in @erp/brand because its integrity —
 * proportions, clear space, never redrawn — is a brand rule rather than a UI
 * choice. Two independent implementations would drift, and drift here means
 * exactly the distortion the identity directive forbids.
 *
 * The component NEVER redraws the mark. It renders the supplied asset, and
 * `height` only ever scales it proportionally: width is `auto`, so the aspect
 * ratio cannot be broken by a caller.
 */

interface LogoProps {
  /** Rendered height in px. Width follows automatically. */
  height?: number;
  /** Use the compact mark instead of the full lockup. */
  variant?: 'primary' | 'mark';
  className?: string;
  /** Decorative when the brand name is already announced nearby. */
  decorative?: boolean;
}

export function Logo({
  height = 40,
  variant = 'primary',
  className,
  decorative = false,
}: LogoProps) {
  const [missing, setMissing] = useState(false);
  const src = variant === 'mark' ? LOGO.mark : LOGO.primary;

  // Asset not yet on disk. Renders the name as plain type — deliberately NOT
  // a reconstruction of the mark, so nothing here can be mistaken for it.
  if (missing) {
    return (
      <span
        className={className}
        style={{ fontSize: height * 0.42, letterSpacing: '0.18em', fontWeight: 600 }}
        title="Logo asset missing — see public/brand/README.md"
      >
        {BRAND.name}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={decorative ? '' : `${BRAND.name} — ${BRAND.nameAr}`}
      aria-hidden={decorative || undefined}
      height={height}
      style={{ height, width: 'auto', display: 'block' }}
      className={className}
      onError={() => setMissing(true)}
      draggable={false}
    />
  );
}
