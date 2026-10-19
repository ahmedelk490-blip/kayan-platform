'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { track } from '@/lib/meta-pixel';

/**
 * اطلب عرض سعر.
 *
 * بطلب المالك: الاسم، رقم التواصل، المنتج (من منتجات النظام)، العدد (أقلّه
 * ٤ قطع)، ونوع الشغل (طباعة/تطريز…). الطلب يُحفظ في النظام — يظهر في «طلبات
 * الموقع» وفي العملاء — ويُرسل بريداً للمصنع، ثم يُفتح واتساب المصنع
 * بتفاصيله جاهزة. التأكيد لا يظهر إلا بعد ردّ 2xx من الخادم.
 */

const MIN_QTY = 4;

const SERVICES = [
  { value: 'printing', label: 'طباعة' },
  { value: 'embroidery', label: 'تطريز' },
  { value: 'print_embroidery', label: 'طباعة + تطريز' },
  { value: 'plain', label: 'سادة (بدون طباعة أو تطريز)' },
] as const;

type Status = 'idle' | 'sending' | 'sent' | 'error';

// قوائم الاختيار: الخيارات بخلفية اللوحة نفسها — كانت بيضاء ونصّها باهت لا يُقرأ.
const FIELD =
  'w-full rounded-xl border bg-panel px-4 py-3.5 text-sm text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-fill/20 [&>option]:bg-panel [&>option]:text-body';

export function QuoteForm({
  products,
  whatsapp,
  defaultProduct,
}: {
  products: { id: string; name: string }[];
  whatsapp: string | null;
  /** يأتي من صفحة منتج (/quote?product=…) فيُختار مسبقاً. */
  defaultProduct?: string;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  // يبدأ فارغاً: «أقل عدد ٤» حدّ أدنى، لا قيمة مقترحة (بطلب المالك).
  const [qty, setQty] = useState<number | ''>('');
  const [waLink, setWaLink] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const productId = String(form.get('productId') ?? '');
    const service = String(form.get('service') ?? '');
    const name = String(form.get('name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const notes = String(form.get('message') ?? '').trim();

    // تحقّق فوري قبل الإرسال — الخادم يتحقّق مرة ثانية على أي حال.
    const local: Record<string, string> = {};
    if (!name) local.name = 'هذا الحقل مطلوب.';
    if (!phone) local.phone = 'هذا الحقل مطلوب.';
    if (!productId) local.productId = 'اختر المنتج.';
    if (!service) local.service = 'اختر نوع الشغل.';
    if (qty === '' || qty < MIN_QTY) local.quantity = `أقل عدد ${MIN_QTY} قطع.`;
    setErrors(local);
    setFailure('');
    if (Object.keys(local).length) return;

    setStatus('sending');
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        company: String(form.get('company') ?? ''),
        message: notes,
        productId: productId === 'other' ? '' : productId,
        quantity: qty,
        service,
      }),
    }).catch(() => null);

    if (!response) {
      setStatus('error');
      setFailure('ما قدرنا نوصل للخادم. تأكد من الاتصال وحاول مرة ثانية.');
      return;
    }

    if (response.ok) {
      const { eventId } = (await response.json().catch(() => ({}))) as { eventId?: string };
      const params = {
        content_name: 'quote_form',
        content_ids: productId && productId !== 'other' ? [productId] : [],
        content_type: 'product',
        num_items: Number(qty),
      };
      track('CompleteRegistration', params, eventId);
      track('Lead', params, eventId);

      const productName = products.find((p) => p.id === productId)?.name ?? 'منتج حسب الطلب';
      const serviceLabel = SERVICES.find((s) => s.value === service)?.label ?? service;
      const text = [
        'طلب عرض سعر من الموقع',
        `الاسم: ${name}`,
        `الجوال: ${phone}`,
        `المنتج: ${productName}`,
        `العدد: ${Number(qty)} قطعة`,
        `نوع الشغل: ${serviceLabel}`,
        notes ? `ملاحظات: ${notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const link = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}` : null;
      setWaLink(link);
      if (link) window.open(link, '_blank', 'noopener');

      setStatus('sent');
      formEl.reset();
      setQty('');
      return;
    }

    const body = await response.json().catch(() => null);
    if (response.status === 429) {
      setStatus('error');
      setFailure('طلبات كثيرة في وقت قصير. انتظر دقيقة وحاول مرة ثانية.');
      return;
    }

    const mapped: Record<string, string> = {};
    for (const item of body?.errors ?? []) {
      mapped[item.field] =
        item.reason === 'Required.'
          ? 'هذا الحقل مطلوب.'
          : item.reason === 'Does not look like a phone number.'
            ? 'رقم الجوال ما يبدو صحيحاً.'
            : item.field === 'quantity'
              ? `أقل عدد ${MIN_QTY} قطع.`
              : item.reason;
    }
    setErrors(mapped);
    setStatus('error');
    if (Object.keys(mapped).length === 0) setFailure('صار خطأ غير متوقع. حاول مرة ثانية.');
  }

  return (
    <SectionShell size="tall">
      <div id="quote" className="mx-auto w-full max-w-[1400px]">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: EASE.outQuart }}
            className="flex flex-col items-start text-start"
          >
            {/* نفس الشارة الكبيرة الواضحة كباقي الأقسام. */}
            <span className="mb-6 inline-flex items-center gap-2.5 rounded-full bg-brand-fill/15 px-5 py-2.5 text-base font-bold text-brand shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-brand-fill)_30%,transparent)] md:text-lg">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-fill" />
              اطلب عرض سعر
            </span>
            <h2
              className="font-display font-bold text-body"
              style={{
                fontSize: 'clamp(2.2rem, 6vw, 3.9rem)',
                lineHeight: 1.14,
                letterSpacing: 'normal',
                wordSpacing: 'normal',
                overflowWrap: 'normal',
                wordBreak: 'normal',
                maxWidth: '18ch',
                textWrap: 'balance',
              }}
            >
              عطنا فكرة عن طلبك، ونرجع لك بالسعر.
            </h2>
            <p className="mt-6 max-w-[46ch] text-lg leading-[2] text-body-muted md:text-xl">
              اختار المنتج والعدد ونوع الشغل، ونرسل لك تسعيرة مفصّلة بند بند.
              وإذا حبيت عيّنة قبل الكمية، قلها لنا في الملاحظات.
            </p>
            {/* صفّ طمأنة يملأ العمود ويوازن الفورم الطويل. */}
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-body-muted">
              {['رد سريع على واتساب', 'تسعيرة مفصّلة بند بند', `أقل طلب ${MIN_QTY} قطع`].map((li) => (
                <li key={li} className="flex items-center gap-2">
                  <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-brand-fill/15 text-xs text-brand">
                    ✓
                  </span>
                  {li}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* The quietest motion on the page, on purpose: opacity only, so
              nothing shifts under a finger already reaching for a field. */}
          <motion.form
            onSubmit={onSubmit}
            noValidate
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, ease: EASE.outQuart }}
            className="relative overflow-hidden rounded-[28px] border border-edge-strong bg-panel/60 p-7 shadow-[0_40px_100px_-50px_rgba(92,35,52,0.7)] md:p-10"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="name" label="الاسم الكامل" required autoComplete="name" error={errors.name} />
              <Field name="phone" label="رقم التواصل" required type="tel" dir="ltr" autoComplete="tel" error={errors.phone} />

              <div>
                <Label htmlFor="productId" required>نوع المنتج</Label>
                <select id="productId" name="productId" defaultValue={defaultProduct ?? ""} aria-invalid={Boolean(errors.productId)} className={`${FIELD} ${errors.productId ? 'border-red-500' : 'border-edge-strong'}`}>
                  <option value="" disabled>اختر المنتج…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="other">منتج آخر / حسب الطلب</option>
                </select>
                {errors.productId && <ErrorText>{errors.productId}</ErrorText>}
              </div>

              <div>
                <Label htmlFor="quantity" required>عدد القطع</Label>
                <div className={`flex items-center rounded-xl border ${errors.quantity ? 'border-red-500' : 'border-edge-strong'}`}>
                  <button type="button" aria-label="أنقص" onClick={() => setQty((q) => (q === '' ? q : Math.max(MIN_QTY, q - 1)))} className="px-4 py-3 text-lg text-body-muted">−</button>
                  <input
                    id="quantity"
                    type="number"
                    inputMode="numeric"
                    min={MIN_QTY}
                    value={qty}
                    placeholder={`${MIN_QTY} أو أكثر`}
                    onChange={(e) => setQty(e.target.value === '' ? '' : Math.max(0, Math.round(Number(e.target.value) || 0)))}
                    dir="ltr"
                    className="w-full bg-transparent py-3 text-center text-sm text-body outline-none"
                  />
                  <button type="button" aria-label="زد" onClick={() => setQty((q) => (q === '' || q < MIN_QTY ? MIN_QTY : q + 1))} className="px-4 py-3 text-lg text-body-muted">+</button>
                </div>
                {errors.quantity ? (
                  <ErrorText>{errors.quantity}</ErrorText>
                ) : (
                  <p className="mt-1.5 text-xs text-body-subtle">أقل عدد {MIN_QTY} قطع.</p>
                )}
              </div>

              <div>
                <Label htmlFor="service" required>نوع الشغل</Label>
                <select id="service" name="service" defaultValue="" aria-invalid={Boolean(errors.service)} className={`${FIELD} ${errors.service ? 'border-red-500' : 'border-edge-strong'}`}>
                  <option value="" disabled>طباعة أو تطريز…</option>
                  {SERVICES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                {errors.service && <ErrorText>{errors.service}</ErrorText>}
              </div>

              <Field name="company" label="اسم الشركة (اختياري)" autoComplete="organization" error={errors.company} />
            </div>

            <div className="mt-5">
              <Label htmlFor="message">ملاحظات</Label>
              <textarea
                id="message"
                name="message"
                rows={3}
                placeholder="الألوان، مكان الشعار، موعد التسليم…"
                className={`${FIELD} resize-y border-edge-strong placeholder:text-body-subtle`}
              />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={status === 'sending'}
                className="rounded-full bg-brand-fill px-9 py-4 text-sm font-bold text-on-brand shadow-[0_18px_40px_-16px_rgba(92,35,52,0.9)] disabled:opacity-60"
              >
                {status === 'sending' ? 'جارٍ الإرسال…' : 'أرسل الطلب'}
              </button>

              {status === 'sent' && (
                <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-ok/40 bg-ok/10 px-4 py-3 text-sm font-medium text-ok">
                  <span>✓ وصلنا طلبك، وبنتواصل معك على رقمك.</span>
                  {waLink && (
                    <a href={waLink} target="_blank" rel="noopener noreferrer" className="rounded-full bg-brand-fill px-4 py-1.5 text-xs font-bold text-on-brand">
                      أرسل التفاصيل على واتساب
                    </a>
                  )}
                </div>
              )}
              {status === 'error' && failure && (
                <p role="alert" className="text-sm text-red-400">
                  {failure}
                </p>
              )}
            </div>
          </motion.form>
        </div>
      </div>
    </SectionShell>
  );
}

function Label({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-xs text-body-muted">
      {children}
      {required && <span className="ms-1 text-brand">*</span>}
    </label>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-red-400">{children}</p>;
}

function Field({
  name,
  label,
  required,
  type = 'text',
  dir,
  autoComplete,
  error,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  dir?: 'ltr' | 'rtl';
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={name} required={required}>{label}</Label>
      <input
        id={name}
        name={name}
        type={type}
        dir={dir}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`${FIELD} ${error ? 'border-red-500' : 'border-edge-strong'} ${dir === 'ltr' ? 'text-start' : ''}`}
      />
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
