'use client';

/**
 * أزرار الطباعة والمشاركة — تختفي عند الطباعة نفسها.
 *
 * `window.print()` is the whole PDF pipeline: the browser's own dialog offers
 * "Save as PDF", which produces selectable Arabic text with correct shaping
 * and no embedded-font licence question.
 */
export function PrintActions({
  shareText,
  backHref,
}: {
  /** Pre-filled WhatsApp message. */
  shareText: string;
  backHref: string;
}) {
  return (
    <div className="no-print mx-auto flex max-w-[210mm] flex-wrap items-center gap-3 px-6 py-5">
      <button type="button" onClick={() => window.print()} className="erp-btn">
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

      <p className="ms-auto text-[0.7rem] text-txt-4">
        من نافذة الطباعة اختر «حفظ كـ PDF» — يخرج نصاً قابلاً للتحديد لا صورة.
      </p>
    </div>
  );
}
