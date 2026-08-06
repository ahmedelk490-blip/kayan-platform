/**
 * @erp/brand — KAYAN identity.
 *
 * Token *values* live in tokens.css so one source drives Tailwind and raw
 * CSS. This file carries identity facts that JavaScript needs.
 */

export const BRAND = {
  name: 'KAYAN',
  nameAr: 'كيان',

  tagline: {
    en: 'Safety Vests • T-Shirts • Corporate & Restaurant Uniforms',
    ar: 'يلكات • تيشيرتات • زي الشركات والمطاعم',
  },

  message: {
    en: 'Premium Materials | Modern Designs | Embroidery & Printing',
    ar: 'خامات ممتازة | ستايلات عصرية | تطريز وطباعة',
  },

  slogan: {
    en: 'Every Successful Brand Starts with KAYAN.',
    ar: 'كل علامة ناجحة تبدأ بكيان ✨',
  },
} as const;

/** Logo asset paths. The files are the source of truth — never redrawn. */
export const LOGO = {
  /** ⚠ Interim: 150×150 JPEG with a baked maroon field. Adequate for the
   *  navbar and footer; too small for the intro and unusable for print.
   *  See public/brand/README.md for what is needed. */
  primary: '/brand/kayan-logo.jpg',
  mark: '/brand/kayan-logo.jpg',
  /** Minimum rendered width in px. Below this the Arabic wordmark breaks up. */
  minWidth: 88,
  /** Clear space around the logo, as a multiple of its rendered height. */
  clearSpaceRatio: 0.35,
} as const;

/**
 * Colour tokens exposed to JS.
 *
 * 3D scenes and canvas work cannot read CSS custom properties, so the values
 * are mirrored here. They must stay in step with tokens.css.
 */
export const COLORS = {
  primary: '#5c2334', // sampled from the logo
  primaryLight: '#943854',
  primaryDeep: '#30121b',
  ink: '#120d0e',
  inkRaised: '#20181a',
  /** Lighter tints of the brand maroon — the only accent. No third hue. */
  accent: '#c46481',
  accentLight: '#d99bae',
  neutral100: '#f2eeee',
  neutral400: '#a2979a',
  neutral700: '#453c40',
} as const;

export type BrandColor = keyof typeof COLORS;
