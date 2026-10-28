'use client';

import { useEffect } from 'react';

/**
 * الأرقام العربية (٠-٩) والفارسية (۰-۹) تُكتب إنكليزيةً في حقول الأرقام.
 *
 * لوحة المفاتيح العربية تُدخل «٣٤» فيختلط الحقل «٣٤00» ويرفضه المتصفح أو
 * يقرؤه خطأ (شكوى المالك في المصروفات). يُحوَّل كل حرفٍ لحظة كتابته أو لصقه
 * في حقول الأرقام والهواتف وأي حقلٍ اتجاهه ltr — مرةً واحدةً للنظام كله بدل
 * تعديل ٦٧ حقلاً.
 */
const DIGITS = /[٠-٩۰-۹٫٬]/;

export function toLatinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹٫٬]/g, (ch) => {
    if (ch === '٫') return '.';
    if (ch === '٬') return '';
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function isNumericField(t: EventTarget | null): t is HTMLInputElement {
  if (!(t instanceof HTMLInputElement)) return false;
  if (t.type === 'number' || t.type === 'tel') return true;
  const mode = t.inputMode;
  return mode === 'numeric' || mode === 'decimal' || mode === 'tel' || t.getAttribute('dir') === 'ltr';
}

export function LatinDigits() {
  useEffect(() => {
    const onBeforeInput = (e: InputEvent) => {
      if (!e.data || !DIGITS.test(e.data) || !isNumericField(e.target)) return;
      e.preventDefault();
      document.execCommand('insertText', false, toLatinDigits(e.data));
    };
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (!DIGITS.test(text) || !isNumericField(e.target)) return;
      e.preventDefault();
      document.execCommand('insertText', false, toLatinDigits(text));
    };
    document.addEventListener('beforeinput', onBeforeInput, true);
    document.addEventListener('paste', onPaste, true);
    return () => {
      document.removeEventListener('beforeinput', onBeforeInput, true);
      document.removeEventListener('paste', onPaste, true);
    };
  }, []);
  return null;
}
