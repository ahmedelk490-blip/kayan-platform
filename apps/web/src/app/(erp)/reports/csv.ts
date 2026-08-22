import 'server-only';

/**
 * تصدير CSV يفتحه Excel مباشرةً — دون مكتبة XLSX.
 *
 * نفس نهج تصدير الطلبات: BOM ليقرأ Excel العربية UTF-8، وحماية من حقن
 * المعادلات (خلية تبدأ بـ = أو + أو - أو @)، وأسطر CRLF كما يتوقّع Excel على
 * ويندوز. الأرقام تُكتب بلا اقتباس ليعاملها Excel أرقاماً تُجمَع، لا نصوصاً.
 */

/** يهرب حقلاً واحداً. الأرقام تمرّ كما هي؛ النصوص تُقتبس وتُحمى من الحقن. */
export function cell(value: unknown): string {
  // رقم صحيح المدى يُكتب بلا اقتباس — فيبقى رقماً في Excel قابلاً للجمع. لا
  // خطر حقن من رقم، والسالب لا يُسبق بعلامة اقتباس تحوّله نصاً.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** استجابة تنزيل CSV جاهزة لـ Excel. */
export function csvResponse(filename: string, headers: string[], rows: unknown[][]): Response {
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))];
  // BOM بالهروب لا حرفياً — الحرف غير المرئي يُفقد بصمت عند مرور الملف بأداة نسخ.
  return new Response(String.fromCharCode(0xfeff) + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // بيانات عمل: لا تُخزَّن في وسيط ولا في المتصفح.
      'Cache-Control': 'no-store',
    },
  });
}

/** اسم ملف مختوم بالتاريخ: kayan-inventory-2026-08-22.csv */
export function stampedName(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
