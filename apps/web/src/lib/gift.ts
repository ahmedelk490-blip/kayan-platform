/**
 * «الهدية» — ما يُعطى للزبون مجاناً ضمن عرض (يأخذ عدداً معيناً فيحصل على هدية).
 *
 * تُحفظ سطراً أولاً في ملاحظات الفاتورة «🎁 الهدية: …» بلا عمود جديد في قاعدة
 * البيانات، فتظهر في الفاتورة والطباعة فوراً، وفورم التعديل يقرؤها ويعيدها.
 */
export const GIFT_MARK = '🎁 الهدية:';

/** نص الهدية من ملاحظات الفاتورة، أو null. */
export function giftOf(notes: string | null | undefined): string | null {
  const line = (notes ?? '').split('\n').find((ln) => ln.startsWith(GIFT_MARK));
  const gift = line?.slice(GIFT_MARK.length).trim();
  return gift || null;
}

/** الملاحظات بلا سطر الهدية — لخانة «ملاحظات» في فورم التعديل. */
export function notesWithoutGift(notes: string | null | undefined): string {
  return (notes ?? '')
    .split('\n')
    .filter((ln) => !ln.startsWith(GIFT_MARK))
    .join('\n')
    .trim();
}

/** يضع سطر الهدية أول الملاحظات (ويشيل أي سطر هدية قديم). */
export function notesWithGift(notes: string | null | undefined, gift: FormDataEntryValue | null): string | null {
  const kept = notesWithoutGift(notes);
  const g = String(gift ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!g) return kept || null;
  const line = `${GIFT_MARK} ${g}`;
  return kept ? `${line}\n${kept}` : line;
}

/**
 * «المحافظة» — محافظة الطلب للتوصيل، سطرٌ في ملاحظات الفاتورة بنفس طريقة
 * الهدية (بلا عمود جديد): «📍 المحافظة: بغداد».
 */
export const GOV_MARK = '📍 المحافظة:';

export const IRAQ_GOVERNORATES = [
  'بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'كركوك', 'الأنبار', 'ديالى', 'صلاح الدين',
  'بابل', 'كربلاء', 'النجف', 'واسط', 'القادسية', 'ميسان', 'ذي قار', 'المثنى', 'حلبجة',
] as const;

export function governorateOf(notes: string | null | undefined): string | null {
  const line = (notes ?? '').split('\n').find((ln) => ln.startsWith(GOV_MARK));
  return line?.slice(GOV_MARK.length).trim() || null;
}

/** يضع سطر المحافظة أول الملاحظات (ويشيل القديم). قيمةٌ خارج القائمة تُهمَل. */
export function notesWithGovernorate(notes: string | null | undefined, gov: FormDataEntryValue | null): string | null {
  const kept = (notes ?? '').split('\n').filter((ln) => !ln.startsWith(GOV_MARK)).join('\n').trim();
  const g = String(gov ?? '').trim();
  if (!(IRAQ_GOVERNORATES as readonly string[]).includes(g)) return kept || null;
  const line = `${GOV_MARK} ${g}`;
  return kept ? `${line}\n${kept}` : line;
}

/** الملاحظات بلا سطري الهدية والمحافظة — لخانة «ملاحظات» في فورم التعديل. */
export function plainNotes(notes: string | null | undefined): string {
  return notesWithoutGift(notes).split('\n').filter((ln) => !ln.startsWith(GOV_MARK)).join('\n').trim();
}
