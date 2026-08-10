'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { EASE } from '@erp/motion';
import { SectionShell } from '@erp/ui-market';
import { QUOTE_SERVICES } from '@/site';

/**
 * اطلب عرض سعر.
 *
 * رقم الجوال هو الحقل الإلزامي الوحيد بعد الاسم — هذا السوق يرد على واتساب،
 * وإلزام البريد يخسر طلبات من ناس ما يستخدمونه أصلاً.
 *
 * Errors come back from the server and are shown per field. The form does not
 * pretend to have succeeded: the confirmation only appears after a 2xx.
 */

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function QuoteForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setErrors({});
    setFailure('');

    const form = new FormData(event.currentTarget);
    const service = String(form.get('service') ?? '');

    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: String(form.get('name') ?? ''),
        phone: String(form.get('phone') ?? ''),
        company: String(form.get('company') ?? ''),
        message: String(form.get('message') ?? ''),
        interests: service ? [service] : [],
      }),
    }).catch(() => null);

    if (!response) {
      setStatus('error');
      setFailure('ما قدرنا نوصل للخادم. تأكد من الاتصال وحاول مرة ثانية.');
      return;
    }

    if (response.ok) {
      setStatus('sent');
      event.currentTarget.reset();
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
            : item.reason;
    }
    setErrors(mapped);
    setStatus('error');
    if (Object.keys(mapped).length === 0) setFailure('صار خطأ غير متوقع. حاول مرة ثانية.');
  }

  return (
    <SectionShell size="tall">
      <div id="quote" className="mx-auto w-full max-w-[1400px]">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: EASE.outQuart }}
          >
            <span className="mb-5 flex items-center gap-3 text-xs tracking-[0.16em] text-body-muted">
              <span className="h-px w-10 bg-brand-fill" />
              اطلب عرض سعر
            </span>
            <h2 className="font-display text-display-3 leading-[1.2] text-body">
              عطنا فكرة عن طلبك، ونرجع لك بالسعر.
            </h2>
            <p className="mt-5 max-w-[46ch] text-lg leading-[1.85] text-body-muted">
              اكتب لنا نوع الزي والكمية التقريبية، ونرسل لك تسعيرة مفصّلة بند بند.
              وإذا حبيت عيّنة قبل الكمية، قلها لنا في الملاحظات.
            </p>
          </motion.div>

          {/* The quietest motion on the page, on purpose. A form that slides
              into place reads as decoration; this one has to read as somewhere
              safe to type a phone number. Opacity only — nothing moves, so
              nothing can shift under a finger already reaching for a field. */}
          <motion.form
            onSubmit={onSubmit}
            noValidate
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, ease: EASE.outQuart }}
            className="rounded-2xl border border-edge-strong bg-panel/70 p-7 md:p-9"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="name" label="الاسم" required error={errors.name} />
              <Field
                name="phone"
                label="رقم الجوال"
                required
                type="tel"
                dir="ltr"
                error={errors.phone}
              />
              <Field name="company" label="اسم الشركة" error={errors.company} />

              <div>
                <label htmlFor="service" className="mb-2 block text-xs text-body-muted">
                  نوع الخدمة المطلوبة
                </label>
                <select
                  id="service"
                  name="service"
                  defaultValue=""
                  className="w-full rounded-lg border border-edge-strong bg-page px-4 py-3 text-sm text-body outline-none transition-colors focus:border-brand"
                >
                  <option value="">اختر…</option>
                  {QUOTE_SERVICES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="message" className="mb-2 block text-xs text-body-muted">
                ملاحظات
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                placeholder="الكمية التقريبية، الألوان، مكان الشعار…"
                className="w-full resize-y rounded-lg border border-edge-strong bg-page px-4 py-3 text-sm text-body outline-none transition-colors placeholder:text-body-subtle focus:border-brand"
              />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={status === 'sending'}
                className="rounded-full bg-brand-fill px-8 py-4 text-sm font-medium text-on-brand transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {status === 'sending' ? 'جارٍ الإرسال…' : 'أرسل الطلب'}
              </button>

              {status === 'sent' && (
                <p role="status" className="text-sm text-brand">
                  وصلنا طلبك. بنتواصل معك على الرقم اللي كتبته.
                </p>
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

function Field({
  name,
  label,
  required,
  type = 'text',
  dir,
  error,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  dir?: 'ltr' | 'rtl';
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-xs text-body-muted">
        {label}
        {required && <span className="ms-1 text-brand">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        dir={dir}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`w-full rounded-lg border bg-page px-4 py-3 text-sm text-body outline-none transition-colors focus:border-brand ${
          error ? 'border-red-500' : 'border-edge-strong'
        } ${dir === 'ltr' ? 'text-start' : ''}`}
      />
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-[0.7rem] text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
