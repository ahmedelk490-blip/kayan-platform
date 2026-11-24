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

/** سطر المنطقة/العنوان داخل المحافظة (بطلب المالك): «🏘 المنطقة: الكرادة — قرب …». */
export const AREA_MARK = '🏘 المنطقة:';

export function areaOf(notes: string | null | undefined): string | null {
  const line = (notes ?? '').split('\n').find((ln) => ln.startsWith(AREA_MARK));
  return line?.slice(AREA_MARK.length).trim() || null;
}

/**
 * يضع سطري المحافظة والمنطقة أول الملاحظات (ويشيل القديمين). محافظةٌ خارج
 * القائمة تُهمَل؛ والمنطقة نصٌّ حرّ (سطر واحد، حتى 200 حرف).
 */
export function notesWithGovernorate(
  notes: string | null | undefined,
  gov: FormDataEntryValue | null,
  area?: FormDataEntryValue | null,
): string | null {
  const kept = (notes ?? '')
    .split('\n')
    .filter((ln) => !ln.startsWith(GOV_MARK) && !ln.startsWith(AREA_MARK))
    .join('\n')
    .trim();
  const g = String(gov ?? '').trim();
  const a = String(area ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const lines = [
    ...((IRAQ_GOVERNORATES as readonly string[]).includes(g) ? [`${GOV_MARK} ${g}`] : []),
    ...(a ? [`${AREA_MARK} ${a}`] : []),
  ];
  if (kept) lines.push(kept);
  return lines.length ? lines.join('\n') : null;
}

/** الملاحظات بلا سطري الهدية والمحافظة — لخانة «ملاحظات» في فورم التعديل. */
export function plainNotes(notes: string | null | undefined): string {
  return notesWithoutGift(notes)
    .split('\n')
    .filter((ln) => !ln.startsWith(GOV_MARK) && !ln.startsWith(AREA_MARK))
    .join('\n')
    .trim();
}
