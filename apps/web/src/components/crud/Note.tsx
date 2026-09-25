/**
 * شرحُ شاشةٍ — مطويٌّ على الهاتف، مفتوحٌ على الديسكتوب.
 *
 * الشروح مفيدة لمن يفتح الشاشة أوّل مرّة، ثم تصير أربعة أسطر تفصل العنوان عن
 * العمل في كل مرّة بعدها. وعلى شاشة هاتفٍ تعني تمريرةً كاملة قبل أن يبدأ
 * المحتوى.
 *
 * فصار الشرح على الهاتف سطراً واحداً يُفتح بضغطة (‏<details>‏ بلا جافاسكربت،
 * فيعمل قبل أن تصل حزمة الصفحة)، وعلى الديسكتوب — حيث المساحة موجودة — يُعرض
 * كما كان بلا زرّ. النصّ نفسه في الحالتين: لا شيء يُحذف، يُطوى فقط.
 */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <>
      <details className="mb-4 rounded-lg border border-line bg-card-2 px-3 py-2 sm:hidden">
        <summary className="cursor-pointer select-none text-[0.7rem] font-medium text-txt-3 marker:text-txt-4">
          كيف تعمل هذه الشاشة؟
        </summary>
        <p className="mt-2 text-[0.7rem] leading-[1.9] text-txt-3">{children}</p>
      </details>
      <p className="mb-4 hidden text-xs leading-[1.9] text-txt-3 sm:block">{children}</p>
    </>
  );
}
