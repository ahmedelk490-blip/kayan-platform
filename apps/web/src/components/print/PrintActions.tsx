'use client';

import { useState } from 'react';

/**
 * أزرار الطباعة والمشاركة — تختفي عند الطباعة نفسها.
 *
 * `window.print()` is the whole PDF pipeline: the browser's own dialog offers
 * "Save as PDF", which produces selectable Arabic text with correct shaping
 * and no embedded-font licence question.
 *
 * ── وحفظ الصورة في الاستوديو ────────────────────────────────
 *
 * الزبون الذي يطلب من إنستغرام أو ماسنجر لا يفتح PDF: صورةٌ واحدة تُرسل
 * وتُقرأ في مكانها. والمطلوب أن تصل الاستوديو مباشرةً لا أن تنزل ملفاً
 * يُبحث عنه في التنزيلات. وللمتصفّح طريقان لا ثالث لهما:
 *
 *   ١ · ورقة المشاركة (`navigator.share` بملف) — فيها «حفظ الصورة»
 *       وإنستغرام وواتساب معاً. تحتاج HTTPS ولمسةً من المستخدم.
 *   ٢ · الضغط المطوّل على صورةٍ معروضة — يعطي «حفظ الصورة» إلى الاستوديو
 *       مباشرةً، ويعمل دائماً ولو غابت ورقة المشاركة.
 *
 * فالصورة تُعرَض أوّلاً وفوقها زرّ المشاركة: من ضغط الزرّ وصلته الورقة،
 * ومن لم تظهر له ضغط على الصورة مطوّلاً. ولا يُنزَّل ملف إلا على الحاسوب،
 * حيث لا استوديو أصلاً.
 *
 * html2canvas يرسم النصّ بنفسه، ومحرّك المتصفّح هو من يشكّل الحروف العربية
 * ويصلها — عدا letter-spacing فإنه يُطبَّق حرفاً حرفاً فيفكّ الوصل، فيُصفَّر
 * في النسخة المرسومة وحدها (`onclone`) دون المسّ بالصفحة المعروضة.
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
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);

  async function makeImage() {
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

      setShot((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), blob };
      });
    } catch {
      setError('تعذّر إنشاء الصورة. جرّب «طباعة / حفظ PDF».');
    } finally {
      setBusy(false);
    }
  }

  async function shareImage() {
    if (!shot) return;
    const file = new File([shot.blob], `${fileBase}.png`, { type: 'image/png' });
    // ورقة المشاركة تحمل «حفظ الصورة» إلى الاستوديو وإنستغرام وواتساب معاً.
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileBase, text: shareText });
        return;
      } catch (err) {
        // إلغاء المستخدم ليس خطأً يُبلَّغ عنه.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    // لا ورقة مشاركة (الحاسوب غالباً) — يُنزَّل الملف، ولا استوديو هناك أصلاً.
    const a = document.createElement('a');
    a.href = shot.url;
    a.download = `${fileBase}.png`;
    a.click();
  }

  return (
    <div className="no-print mx-auto max-w-[210mm] px-6 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={makeImage} disabled={busy} className="erp-btn disabled:opacity-60">
          {busy ? 'جارٍ تجهيز الصورة…' : '📷 حفظ كصورة'}
        </button>

        <button type="button" onClick={() => window.print()} className="erp-btn-ghost">
          طباعة / حفظ PDF
        </button>

        {/*
          No recipient number is pre-filled, and none is invented: wa.me without
          a number opens WhatsApp's own contact picker, so the sender chooses.
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

      {shot && (
        <div className="mt-4 rounded-xl border border-line bg-card-2 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-txt">صورة الفاتورة جاهزة</span>
            <span className="flex gap-2">
              <button type="button" onClick={shareImage} className="erp-btn">
                حفظ / مشاركة
              </button>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(shot.url);
                  setShot(null);
                }}
                className="erp-btn-ghost"
              >
                إغلاق
              </button>
            </span>
          </div>
          {/* صورة حقيقية لا رسمٌ على canvas: الضغط المطوّل عليها يعطي «حفظ
              الصورة» إلى الاستوديو مباشرةً، وهذا يعمل حتى حيث تغيب ورقة
              المشاركة. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.url}
            alt="صورة الفاتورة"
            className="w-full rounded-lg border border-line bg-white"
          />
          <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
            اضغط «حفظ / مشاركة» لإرسالها مباشرةً لإنستغرام أو ماسنجر أو حفظها في
            الاستوديو — أو اضغط على الصورة مطوّلاً ثم «حفظ الصورة».
          </p>
        </div>
      )}

      <p className="mt-2 text-[0.7rem] leading-[1.9] text-txt-4">
        الفاتورة تُرسل بلا «المدفوع» و«المتبقي» — حالة السداد عندنا على صفحة الفاتورة.
        ومن نافذة الطباعة اختر «حفظ كـ PDF» — يخرج نصاً قابلاً للتحديد لا صورة.
      </p>
    </div>
  );
}
