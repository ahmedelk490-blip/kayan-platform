/**
 * تصنيف المرتجعات من اسم الصنف — تيشيرت/يلك/مريلة/قبعة/شفقة.
 *
 * يُشتقّ من وصف سطر المرتجع (الذي جاء من الفاتورة) بلا حقل جديد في قاعدة
 * البيانات، فيصحّ على كل المرتجعات القديمة والجديدة دون إدخال يدوي.
 */
const CATEGORY_RULES: [RegExp, string][] = [
  // بند التوصيل يبدأ بـ 🚚 دائماً (lib/delivery) — يُميَّز قبل قواعد المنتجات.
  [/^🚚/, 'توصيل'],
  [/تيشيرت|تشيرت|تي شيرت|تيشرت|شيرت/, 'تيشيرت'],
  [/يلك|جيليه|سترة/, 'يلك'],
  [/مريلة|مرايل|مريله|مرايله|مريول/, 'مريلة'],
  [/قبعة|قبعه|قبعات|كاب/, 'قبعة'],
  [/شفقة|شفقه|شفقات|شماغ|غترة/, 'شفقة'],
];

/** تصنيف نصٍّ واحد، أو «أخرى» إن لم يطابق قاعدة. */
export function categoryOf(text: string): string {
  for (const [re, label] of CATEGORY_RULES) if (re.test(text)) return label;
  return 'أخرى';
}

/** التصنيفات المميّزة لمجموعة أوصاف، بترتيب ظهورها — «تيشيرت + يلك». */
export function categoriesOf(descriptions: string[]): string[] {
  const seen: string[] = [];
  for (const d of descriptions) {
    const c = categoryOf(d);
    if (!seen.includes(c)) seen.push(c);
  }
  return seen;
}
