import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Locale-aware number formatting.
 *
 * Arabic-Indic vs Western numerals is configurable per FR-PLT-008 rather than
 * implied by locale — Egyptian business documents commonly use Western digits
 * in Arabic text, so locale alone is the wrong signal.
 */
export function formatNumber(
  value: number,
  locale: 'en' | 'ar' = 'en',
  options: Intl.NumberFormatOptions & { arabicNumerals?: boolean } = {},
) {
  const { arabicNumerals = false, ...rest } = options;
  const tag = locale === 'ar' ? (arabicNumerals ? 'ar-EG' : 'ar-EG-u-nu-latn') : 'en-US';
  return new Intl.NumberFormat(tag, rest).format(value);
}

/** Clamp a number into a range. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Map a value from one range to another, clamped to the output range. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return clamp(outMin + t * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax));
}
