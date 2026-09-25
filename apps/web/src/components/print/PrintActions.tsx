'use client';

import { useState } from 'react';

/**
 * أزرار الطباعة والمشاركة — تختفي عند الطباعة نفسها.
 *
 * `window.print()` is the whole PDF pipeline: the browser's own dialog offers
 * "Save as PDF", which produces selectable Arabic text with correct shaping
 * and no embedded-font licence question.
 *
 * ── وحفظ الصورة ─────────────────────────────────────────────
 *
 * الزبون الذي يطلب من إنستغرام أو ماسنجر لا يفتح PDF ولا يريد ذلك: صورة
 * واحدة تُرسَل وتُقرأ في مكانها. فالصفحة نفسها تُرسم على canvas بدل توليد
 * مستند ثانٍ قد يختلف عن المطبوع.
 *
 * html2canvas يرسم النص بنفسه على الـ canvas، ومحرّك المتصفح هو من يشكّل
 * الحروف العربية ويصلها — لذلك يخرج النص سليماً. الاستثناء الوحيد أن
 * `letter-spacing` يُطبَّق حرفاً حرفاً فيفكّ الوصل، فيُصفَّر في النسخة
 * المرسومة وحدها (`onclone`) دون المسّ بالصفحة المعروضة.
 */
export function PrintActions({
  shareText,
  backHref,
  fileBase,
}: {
  /** Pre-filled WhatsApp message. */
  shareText: string;
  backHref: string;
  /** اسم ملف الصورة بلا امتداد — رقم المستند. */
  fileBase: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveImage() {
    const node = document.querySelector<HTMLElement>('.print-doc');
    if (!node) return;

    setBusy(true);
    setError(null);
    try {
      // مُحمَّل عند الطلب — لا يُثقل أول تحميل للصفحة لمن يطبع فقط.
      const { default: html2canvas } = await import('html2canvas');

      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 2, // ‏≈1600px عرضاً — يكفي للقراءة على الهاتف بعد ضغط المنصّات.
        useCORS: true,
        logging: false,
        onclone: (doc) => {
          doc.querySelector('.print-doc')?.classList.add('print-as-image');
          const style = doc.createElement('style');
          // بدون هذا تتفكّك الحروف العربية في الرسم — لا شأن له بالصفحة نفسها.
          style.textContent = '*{letter-spacing:0 !important}';
          doc.head.appendChild(style);
        },
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('blob');

      const name = `${fileBase}.png`;
      const file = new File([blob], name, { type: 'image/png' });

      // على الهاتف: ورقة المشاركة تفتح إنستغرام وماسنجر وواتساب مباشرة.
      // وإن رفضها المتصفح أو ألغاها المستخدم، يُحفظ الملف بدل أن يضيع العمل.
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: fileBase, text: shareText });
          return;
        } catch (err) {
          // إلغاء المستخدم ليس خطأً يُبلَّغ عنه.
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      // يُترك للمتصفح وقتٌ لبدء التنزيل قبل سحب الرابط من تحته.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError('تعذّر إنشاء الصورة. جرّب «طباعة / حفظ PDF».');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print mx-auto max-w-[210mm] px-6 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={saveImage} disabled={busy} className="erp-btn disabled:opacity-60">
          {busy ? 'جاري تجهيز الصورة…' : '📷 حفظ كصورة'}
        </button>

        <button type="button" onClick={() => window.print()} className="erp-btn-ghost">
          طباعة / حفظ PDF
        </button>

        {/*
          No recipient number is pre-filled, and none is invented: wa.me without
          a number opens WhatsApp's own contact picker, so the sender chooses.
          The message carries the document summary; the PDF is attached by the
          sender after saving it. A public link would need a signed token, which
          is a security decision nobody has taken yet — so it is not faked here.
        */}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="erp-btn-ghost"
        >
          إرسال عبر واتساب
        </a>

        <a href={backHref} className="erp-btn-ghost">
          رجوع
        </a>
      </div>

      {error && <p className="mt-2 text-[0.75rem] text-bad">{error}</p>}

      <p className="mt-2 text-[0.7rem] leading-[1.9] text-txt-4">
        الصورة تُرسَل للزبون كما هي — بلا «المدفوع» و«المتبقي»، فهما يبقيان على الشاشة وفي
        الورق عندنا فقط. ومن نافذة الطباعة اختر «حفظ كـ PDF» — يخرج نصاً قابلاً للتحديد لا صورة.
      </p>
    </div>
  );
}
