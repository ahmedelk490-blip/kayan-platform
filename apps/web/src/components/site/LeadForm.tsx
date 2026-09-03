'use client';

import { useState } from 'react';
import { cn } from '@erp/utils';
import { PRODUCTS } from '@/site';

type Status = 'idle' | 'submitting' | 'success' | 'error';

/**
 * نموذج طلب عرض السعر.
 *
 * النموذج مهمة، لا مشهد — لا حركة زائدة تبطّئ الزائر. رسائل الخطأ نصّية
 * وليست لوناً فقط، وكل خطأ مربوط بحقله لقارئ الشاشة.
 */
export function LeadForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setErrors({});
    setFormError('');

    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get('name') ?? ''),
      company: String(data.get('company') ?? ''),
      email: String(data.get('email') ?? ''),
      phone: String(data.get('phone') ?? ''),
      message: String(data.get('message') ?? ''),
      interests: data.getAll('interests').map(String),
    };

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setStatus('success');
        return;
      }

      const body = await response.json().catch(() => null);
      if (response.status === 422 && body?.errors) {
        const mapped: Record<string, string> = {};
        for (const item of body.errors as { field: string; reason: string }[]) {
          mapped[item.field] = FIELD_ERRORS[item.field] ?? 'من فضلك راجع هذا الحقل.';
        }
        setErrors(mapped);
        setFormError('من فضلك راجع الحقول المحددة.');
      } else {
        setFormError(body?.error ?? 'حدث خطأ ما. من فضلك حاول مرة أخرى.');
      }
      setStatus('error');
    } catch {
      setFormError('تعذّر الوصول إلى الخادم. تأكد من اتصالك بالإنترنت.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-primary-600/40 bg-primary-950/40 p-8 md:p-10"
      >
        <h2 className="font-display text-2xl text-body">وصلنا طلبك — شكراً لك.</h2>
        <p className="mt-4 max-w-[48ch] text-sm leading-loose text-body-muted">
          سنرجع لك خلال يوم عمل واحد بعرض سعر واضح وموعد تسليم محدد. لو عندك شعار أو تصميم
          جاهز، أرسله لنا وسيكون العرض أدق.
        </p>
      </div>
    );
  }

  // توكنات لا درجات داكنة ثابتة — الحقول كانت بنص شبه أبيض على خلفية حبرية
  // فتصير غير مقروءة في الوضع الفاتح.
  const fieldClass = (name: string) =>
    cn(
      'w-full rounded-xl border bg-surface-raised px-4 py-3 text-sm text-body',
      'placeholder:text-text-subtle transition-colors',
      'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
      errors[name] ? 'border-danger-500/70' : 'border-border-strong',
    );

  const Label = ({
    htmlFor,
    children,
    optional,
  }: {
    htmlFor: string;
    children: React.ReactNode;
    optional?: boolean;
  }) => (
    <label htmlFor={htmlFor} className="mb-2 block text-xs tracking-[0.1em] text-body-muted">
      {children}
      {optional && <span className="ms-2 text-body-subtle">اختياري</span>}
    </label>
  );

  const FieldError = ({ name }: { name: string }) =>
    errors[name] ? (
      <p id={`${name}-error`} className="mt-2 text-xs text-danger-500">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">الاسم</Label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className={fieldClass('name')}
            placeholder="اسمك بالكامل"
          />
          <FieldError name="name" />
        </div>
        <div>
          <Label htmlFor="company">اسم الشركة</Label>
          <input
            id="company"
            name="company"
            autoComplete="organization"
            required
            aria-invalid={Boolean(errors.company)}
            aria-describedby={errors.company ? 'company-error' : undefined}
            className={fieldClass('company')}
            placeholder="الشركة أو المطعم"
          />
          <FieldError name="company" />
        </div>
        <div>
          {/* Phase 8 swapped which of these two is mandatory, to match the
              API: a mobile number is required, email is not. This form was
              still demanding the opposite, so every submission from /contact
              was being rejected by the server. */}
          <Label htmlFor="email" optional>
            البريد الإلكتروني
          </Label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            dir="ltr"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={cn(fieldClass('email'), 'text-start')}
            placeholder="you@company.com"
          />
          <FieldError name="email" />
        </div>
        <div>
          <Label htmlFor="phone">رقم الجوال</Label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'phone-error' : undefined}
            dir="ltr"
            className={cn(fieldClass('phone'), 'text-start')}
            placeholder="+20"
          />
          <FieldError name="phone" />
        </div>
      </div>

      <fieldset>
        <legend className="mb-3 text-xs tracking-[0.1em] text-neutral-400">
          ما الذي تحتاجه؟
          <span className="ms-2 text-neutral-600">اختياري</span>
        </legend>
        <div className="flex flex-wrap gap-2.5">
          {PRODUCTS.map((product) => (
            <label
              key={product.id}
              className="cursor-pointer rounded-full border border-ink-700 px-4 py-2 text-sm text-neutral-300 transition-colors has-[:checked]:border-accent has-[:checked]:bg-primary-950 has-[:checked]:text-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input type="checkbox" name="interests" value={product.id} className="sr-only" />
              {product.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="message" optional>
          تفاصيل الطلب
        </Label>
        <textarea
          id="message"
          name="message"
          rows={4}
          className={cn(fieldClass('message'), 'resize-y')}
          placeholder="مثال: ٥٠٠ تيشيرت بولو بشعار مطرّز على الصدر، مقاسات مختلفة، التسليم خلال ٣ أسابيع…"
        />
        <FieldError name="message" />
      </div>

      {formError && (
        <p role="alert" className="text-sm text-danger-500">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-5 pt-2">
        <button
          type="submit"
          disabled={status === 'submitting'}
          className={cn(
            'rounded-full bg-primary-600 px-7 py-3.5 text-sm font-medium text-neutral-50',
            'transition-opacity hover:bg-primary-500 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            'focus-visible:ring-offset-bg',
            status === 'submitting' && 'cursor-not-allowed opacity-60',
          )}
        >
          {status === 'submitting' ? 'جارٍ الإرسال…' : 'أرسل الطلب'}
        </button>
        <p className="text-xs text-neutral-500">نرد خلال يوم عمل واحد.</p>
      </div>
    </form>
  );
}

/** ترجمة أخطاء الخادم — الـ API يرد بالإنجليزية. */
const FIELD_ERRORS: Record<string, string> = {
  name: 'الاسم مطلوب.',
  company: 'اسم الشركة مطلوب.',
  email: 'البريد الإلكتروني غير صحيح.',
  phone: 'رقم الهاتف غير صحيح.',
  message: 'النص طويل أكثر من اللازم.',
  interests: 'اختيار غير معروف.',
};
