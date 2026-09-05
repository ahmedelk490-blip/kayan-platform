import { Logo } from '@erp/brand/logo';
import { formatMoney, formatQty, balance } from '@erp/domain';
import { isDeliveryDesc } from '@/lib/delivery';

/**
 * مستند للطباعة — عرض سعر أو فاتورة.
 *
 * ── Why this is HTML and not a generated PDF ────────────────
 *
 * Arabic is a connected, right-to-left script. A JavaScript PDF library has
 * to solve glyph shaping, ligatures and bidirectional runs itself, and the
 * common ones get it wrong — letters come out disconnected or reversed, and
 * fixing it means embedding a font and hand-rolling bidi.
 *
 * The browser already does all of that correctly, every time. So the document
 * is real HTML with a print stylesheet, and "Save as PDF" in the print dialog
 * produces the file. The output is selectable text rather than a raster, it
 * honours the Kufi face the brand uses, and there is no font-embedding
 * licence question.
 *
 * ── Every figure is a snapshot ──────────────────────────────
 *
 * Lines are read from the stored document, never recomputed from today's
 * price list. Reprinting a document from last year must produce last year's
 * numbers.
 */

export interface PrintLine {
  id: string;
  lineNo: number;
  description: string;
  quantity: unknown;
  unitPrice: unknown;
  discountAmount: unknown;
  taxAmount: unknown;
  lineTotal: unknown;
}

export interface PrintParty {
  name: string;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
}

export interface PrintCompany {
  name: string;
  currency: string;
  taxNumber?: string | null;
  commercialRegister?: string | null;
  /** Printed verbatim when the business has stated its terms. */
  paymentTerms?: string | null;
}

export function PrintDocument({
  kind,
  number,
  issueDate,
  dueDate,
  party,
  company,
  lines,
  subtotal,
  discountAmount,
  taxAmount,
  total,
  paidAmount,
  notes,
  statusNote,
}: {
  kind: 'quotation' | 'invoice';
  number: string;
  issueDate: Date | null;
  dueDate?: Date | null;
  party: PrintParty;
  company: PrintCompany;
  lines: PrintLine[];
  subtotal: unknown;
  discountAmount: unknown;
  taxAmount: unknown;
  total: unknown;
  paidAmount?: unknown;
  notes?: string | null;
  /** Shown when the document is not a final one — a draft or a void. */
  statusNote?: string | null;
}) {
  const title = kind === 'invoice' ? 'فاتورة' : 'عرض سعر';
  // عدد القطع الكلي — يطبع للعميل كما يظهر على الشاشة، بطلب المالك.
  // بند التوصيل 🚚 ليس قطعة بضاعة فلا يدخل العدّ (يظهر سطراً بقيمته فقط).
  const totalPieces = lines.reduce(
    (s, l) => (isDeliveryDesc(l.description) ? s : s + Number(l.quantity ?? 0)),
    0,
  );

  return (
    <article className="print-doc" dir="rtl">
      {statusNote && <p className="print-status">{statusNote}</p>}

      <header className="print-head">
        <div>
          <Logo height={54} />
          <p className="print-company">{company.name}</p>
          {/* Registration numbers print only when the business has supplied
              them. An invented tax number on a tax document is a forgery. */}
          {company.taxNumber && <p className="print-meta">الرقم الضريبي: {company.taxNumber}</p>}
          {company.commercialRegister && (
            <p className="print-meta">السجل التجاري: {company.commercialRegister}</p>
          )}
        </div>

        <div className="print-head-end">
          <h1 className="print-title">{title}</h1>
          <p className="print-number" dir="ltr">
            {number}
          </p>
          {issueDate && (
            <p className="print-meta">التاريخ: {issueDate.toLocaleDateString('ar-EG')}</p>
          )}
          {dueDate && (
            <p className="print-meta">الاستحقاق: {dueDate.toLocaleDateString('ar-EG')}</p>
          )}
        </div>
      </header>

      <section className="print-party">
        <p className="print-label">{kind === 'invoice' ? 'فاتورة إلى' : 'عرض سعر إلى'}</p>
        <p className="print-party-name">{party.name}</p>
        {party.phone && (
          <p className="print-meta" dir="ltr">
            {party.phone}
          </p>
        )}
        {party.address && <p className="print-meta">{party.address}</p>}
        {party.taxNumber && <p className="print-meta">الرقم الضريبي: {party.taxNumber}</p>}
      </section>

      <table className="print-table">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>الوصف</th>
            <th className="num">الكمية</th>
            <th className="num">سعر الوحدة</th>
            <th className="num">الخصم</th>
            <th className="num">الضريبة</th>
            <th className="num">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.lineNo}</td>
              <td>{line.description}</td>
              <td className="num">{formatQty(line.quantity as never)}</td>
              <td className="num">{formatMoney(line.unitPrice as never)}</td>
              <td className="num">{formatMoney(line.discountAmount as never)}</td>
              <td className="num">{formatMoney(line.taxAmount as never)}</td>
              <td className="num strong">{formatMoney(line.lineTotal as never)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="print-totals">
        <dl>
          <Row label="عدد القطع" value={`${totalPieces} قطعة`} />
          <Row label="المجموع" value={formatMoney(subtotal as never)} />
          <Row label="الخصم" value={formatMoney(discountAmount as never)} />
          <Row label="الضريبة" value={formatMoney(taxAmount as never)} />
          <Row label={`الإجمالي (${company.currency})`} value={formatMoney(total as never)} strong />
          {paidAmount !== undefined && (
            <>
              <Row label="المدفوع" value={formatMoney(paidAmount as never)} />
              {/* Through the domain's `balance`, not JS subtraction. Every
                  other figure in this system is exact decimal; a printed
                  document that disagrees with the screen by a rounding cent
                  is the one place the customer will notice. */}
              <Row
                label="المتبقي"
                value={formatMoney(balance(total as never, paidAmount as never))}
                strong
              />
            </>
          )}
        </dl>
      </section>

      {notes && (
        <section className="print-notes">
          <p className="print-label">ملاحظات</p>
          <p>{notes}</p>
        </section>
      )}

      {/* The terms sentence the business itself entered. Absent means absent —
          a generic "payable within 30 days" would be a term nobody agreed. */}
      {company.paymentTerms && (
        <section className="print-notes">
          <p className="print-label">شروط الدفع</p>
          <p>{company.paymentTerms}</p>
        </section>
      )}

      <footer className="print-foot">
        <p>{company.name}</p>
        {!company.taxNumber && (
          <p className="print-warn">
            ⚠ الرقم الضريبي غير مُدخَل في إعدادات الشركة. أدخِله قبل استخدام هذا المستند
            رسمياً — لم يُخترع رقم هنا.
          </p>
        )}
      </footer>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'strong' : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
