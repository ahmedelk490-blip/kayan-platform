import { z } from 'zod';

/**
 * يحوّل الأرقام العربية-الهندية (٠-٩) والفارسية (۰-۹) إلى لاتينية، ويوحّد
 * الفاصلة العشرية العربية ويحذف فواصل الآلاف.
 *
 * المستخدم العراقي يكتب «١٢٥» أو «١٢٫٥»، و`Number()` لا يفهمها فيعيد NaN،
 * فيسقط الإدخال بصمت أو برسالة خطأ محيّرة. التطبيع هنا يجعل ما يكتبه رقماً
 * حقيقياً — في كل خانة رقمية بالنظام، لا في الفواتير وحدها.
 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ٠-٩
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ۰-۹ الفارسية
    .replace(/٫/g, '.') // الفاصلة العشرية العربية ٫
    .replace(/[٬,]/g, '') // فاصلة الآلاف العربية ٬ واللاتينية
    .trim();
}

/** Number() بعد التطبيع — القيمة غير الصالحة صفر لا NaN. */
export function num(value: unknown): number {
  const n = Number(normalizeDigits(String(value ?? '')));
  return Number.isFinite(n) ? n : 0;
}

/**
 * غلاف zod: يطبّع الأرقام العربية قبل مخطط الرقم الداخلي، ولا يغيّر أي سلوك
 * آخر (null/undefined يمرّان كما هما فتبقى الحقول الاختيارية اختيارية).
 *
 *   amount: numeric(z.coerce.number().positive('…'))
 */
export function numeric<T extends z.ZodTypeAny>(inner: T) {
  return z.preprocess((v) => (v == null ? v : normalizeDigits(String(v))), inner);
}
