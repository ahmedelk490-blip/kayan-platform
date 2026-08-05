/**
 * @erp/brand — identity constants.
 *
 * Token *values* live in tokens.css so a single source drives both
 * Tailwind and raw CSS. This file carries identity facts that JS needs.
 */

/**
 * ⚠ PLACEHOLDER — not a proposed brand name.
 *
 * The company name is unknown (OPEN-35). "AXIS" is a working codename so
 * the site can be previewed. Every visible occurrence reads from here,
 * so replacing it is a one-line change.
 */
export const BRAND = {
  name: 'AXIS',
  nameAr: 'أكسِس',
  tagline: {
    en: 'Print. Embroider. Manufacture. Protect.',
    ar: 'اطبع. طرِّز. صنّع. احمِ.',
  },
  isPlaceholderName: true,
} as const;

/** Colour tokens exposed to JS — 3D scenes cannot read CSS variables. */
export const COLORS = {
  void: '#07090b',
  surface: '#0c1013',
  steel700: '#212a31',
  steel400: '#708391',
  steel100: '#e2e8ec',
  hivis: '#c6f24e',
  signal: '#4dd9ff',
} as const;

export type BrandColor = keyof typeof COLORS;
