/**
 * عيّنة اللون من اسمه حين لا يُسجَّل له كود.
 *
 * ألوان المصنع تُكتب بأسماء مثل «اسود ياخة احمر» أو «اخضر كتف اسود»: لون
 * الجسم ثم لون الياقة/الكتف. بلا كود لوني كانت الدوائر فارغة على الموقع،
 * فنقرأ كلمات الألوان من الاسم ونرسم دائرة بلونين. الكود المسجَّل يغلب دائماً.
 */
const WORDS: [RegExp, string][] = [
  [/اسود/, '#111111'],
  [/ابيض/, '#f4f4f2'],
  [/احمر/, '#c62828'],
  [/اخضر/, '#178a3c'],
  [/(ازرق|ازوق|ازرك)/, '#1d4ed8'],
  [/(نيلي|كحلي)/, '#1e2a4a'],
  [/برتقالي/, '#f2711c'],
  [/اصفر/, '#f5c518'],
  [/(بنفسجي|موف)/, '#6d28d9'],
  [/(رصاصي|رمادي)/, '#8a8a8a'],
  [/(نبيتي|عنابي|خمري|ماروني)/, '#6e1e2c'],
  [/(زيتي|زيتون)/, '#4b5a2e'],
  [/(كاملي|كاميل|جملي)/, '#b9874c'],
  [/بيج/, '#e6d8b8'],
  [/(بني|جوزي)/, '#5c3a21'],
  [/(سماوي|سمائي)/, '#5ab4e5'],
  [/وردي/, '#ec4899'],
  [/ذهبي/, '#d4a017'],
  [/فضي/, '#c0c0c0'],
];

const normalize = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');

/** الألوان المذكورة في الاسم بترتيب ورودها (حتى لونين). */
export function colorsInName(name: string): string[] {
  const text = normalize(name);
  const found: { at: number; hex: string }[] = [];
  for (const [re, hex] of WORDS) {
    const m = new RegExp(re.source, 'g');
    let r: RegExpExecArray | null;
    while ((r = m.exec(text))) found.push({ at: r.index, hex });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.hex).slice(0, 2);
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * كود اللون المخزَّن: «#جسم» أو «#جسم,#ياقة» للألوان المركّبة. يعيد null
 * لأي قيمة غير صالحة فلا تُحفظ قيمة تكسر العيّنة.
 */
export function normalizeHex(value: string): string | null {
  const parts = value.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0 || parts.length > 2 || !parts.every((p) => HEX.test(p))) return null;
  return parts[0] === parts[1] ? parts[0] : parts.join(',');
}

/** الكود المقترح من اسم اللون (لون أو لونان)، أو null إن لم نتعرّف عليه. */
export function suggestHex(name: string): string | null {
  const found = colorsInName(name);
  return found.length ? normalizeHex(found.join(',')) : null;
}

/** خلفية CSS للعيّنة: الكود المسجَّل (لون أو لونان)، أو لونا الاسم، أو لا شيء. */
export function swatchBackground(name: string, hex: string | null | undefined): string | undefined {
  const [body, trim] = (hex && normalizeHex(hex)?.split(',')) || colorsInName(name);
  if (!body) return undefined;
  if (!trim || trim === body) return body;
  // الجسم يملأ الدائرة، وشريط الياقة/الكتف في الأعلى.
  return `linear-gradient(180deg, ${trim} 0 34%, ${body} 34% 100%)`;
}
