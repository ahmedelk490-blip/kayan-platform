/**
 * Catalogue vocabularies.
 *
 * Kept out of actions.ts: a 'use server' module may only export async
 * functions.
 */
export const KINDS = {
  categories: { labelAr: 'التصنيفات', singular: 'تصنيف' },
  colors: { labelAr: 'الألوان', singular: 'لون' },
  sizes: { labelAr: 'المقاسات', singular: 'مقاس' },
  materials: { labelAr: 'الخامات', singular: 'خامة' },
  printing: { labelAr: 'خيارات الطباعة', singular: 'خيار طباعة' },
  embroidery: { labelAr: 'خيارات التطريز', singular: 'خيار تطريز' },
} as const;

export type Kind = keyof typeof KINDS;

export function isKind(value: string): value is Kind {
  return value in KINDS;
}
