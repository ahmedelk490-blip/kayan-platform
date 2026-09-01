/**
 * رابط واتساب جاهز بنص مُعبّأ — زبائن هذا السوق كل تعاملهم واتساب.
 *
 * الرقم يُحوَّل للصيغة الدولية: ٠٧… العراقي يصير ‎964…، و00 تُقص. الفتح لا
 * يُرسل شيئاً بنفسه — يفتح المحادثة والنص جاهز والمستخدم يضغط إرسال بيده.
 */
export function waLink(phoneRaw: string | null | undefined, text: string): string | null {
  if (!phoneRaw) return null;
  let digits = phoneRaw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `964${digits.slice(1)}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
