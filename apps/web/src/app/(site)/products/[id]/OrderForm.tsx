'use client';

import { useState } from 'react';

/**
 * طلب المنتج مباشرة من الموقع.
 *
 * العميل يختار اللون والمقاس والكمية ويترك اسمه ورقمه، فيصل الطلب للـERP
 * كطلب معلّق يحوّله المندوب لفاتورة. لا سعر ولا التزام هنا — مجرّد طلب يُراجَع.
 */
export function OrderForm({
  productId,
  colors,
  sizes,
}: {
  productId: string;
  colors: string[];
  sizes: string[];
}) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [orderNo, setOrderNo] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setErrors({});
    setFailure('');
    const form = new FormData(event.currentTarget);

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId,
        color: String(form.get('color') ?? ''),
        size: String(form.get('size') ?? ''),
        quantity: Number(form.get('quantity') ?? 1),
        name: String(form.get('name') ?? ''),
        phone: String(form.get('phone') ?? ''),
        company: String(form.get('company') ?? ''),
        note: String(form.get('note') ?? ''),
      }),
    }).catch(() => null);

    if (!res) {
      setStatus('error');
      setFailure('ما قدرنا نوصل للخادم. حاول مرة ثانية.');
      return;
    }
    if (res.ok) {
      const body = await res.json().catch(() => null);
      setOrderNo(body?.number ?? '');
      setStatus('sent');
      event.currentTarget.reset();
      return;
    }
    if (res.status === 429) {
      setStatus('error');
      setFailure('طلبات كثيرة في وقت قصير. انتظر دقيقة وحاول مرة ثانية.');
      return;
    }
    const body = await res.json().catch(() => null);
    const mapped: Record<string, string> = {};
    for (const item of body?.errors ?? []) {
      mapped[item.field] =
        item.reason === 'Required.'
          ? 'هذا الحقل مطلوب.'
          : item.reason === 'Does not look like a phone number.'
            ? 'رقم الجوال ما يبدو صحيحاً.'
            : item.reason === 'Must be a whole number of 1 or more.'
              ? 'الكمية لازم تكون رقم صحيح ١ أو أكثر.'
              : item.reason;
    }
    setErrors(mapped);
    setStatus('error');
    if (Object.keys(mapped).length === 0) setFailure('صار خطأ. حاول مرة ثانية.');
  }

  if (status === 'sent') {
    return (
      <div className="mt-10 rounded-[24px] border border-ok/40 bg-ok/10 p-7 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-ok text-lg text-white">✓</div>
        <p className="text-lg font-semibold text-body">وصلنا طلبك</p>
        <p className="mt-2 text-sm leading-[1.9] text-body-muted">
          رقم الطلب <span className="font-bold text-brand" dir="ltr">{orderNo}</span> — بنراجعه ونتواصل معك على الرقم اللي كتبته بالتسعيرة والتفاصيل.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-4 text-sm font-medium text-brand hover:underline"
        >
          اطلب كمية أخرى
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-10 rounded-[24px] border border-white/10 p-6 md:p-8"
      style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008) 55%, transparent)' }}
    >
      <h2 className="text-lg font-bold text-body">اطلب هذا المنتج</h2>
      <p className="mt-1.5 text-sm text-body-muted">اختر اللون والمقاس والكمية، ونرجع لك بالتسعيرة.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {colors.length > 0 && (
          <Select name="color" label="اللون" placeholder="اختر اللون…" options={colors} />
        )}
        {sizes.length > 0 && (
          <Select name="size" label="المقاس" placeholder="اختر المقاس…" options={sizes} />
        )}
        <label className="block">
          <span className="mb-2 block text-xs text-body-muted">الكمية التقريبية</span>
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            defaultValue={12}
            dir="ltr"
            className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5 text-start text-sm text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-fill/20"
          />
          {errors.quantity && <span className="mt-1 block text-[0.7rem] text-red-400">{errors.quantity}</span>}
        </label>
        <Input name="name" label="الاسم" required error={errors.name} />
        <Input name="phone" label="رقم الجوال" required type="tel" dir="ltr" error={errors.phone} />
        <Input name="company" label="اسم الشركة (اختياري)" error={errors.company} />
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-xs text-body-muted">ملاحظات (مكان الشعار، تفاصيل…)</span>
        <textarea
          name="note"
          rows={3}
          placeholder="مثال: الشعار على الصدر، لون الخيط ذهبي…"
          className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5 text-sm text-body outline-none transition-colors placeholder:text-body-subtle focus:border-brand focus:ring-2 focus:ring-brand-fill/20"
        />
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded-full bg-brand-fill px-9 py-4 text-sm font-bold text-on-brand shadow-[0_18px_40px_-16px_rgba(92,35,52,0.9)] transition-all hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-60"
        >
          {status === 'sending' ? 'جارٍ الإرسال…' : 'أرسل الطلب'}
        </button>
        {status === 'error' && failure && <p role="alert" className="text-sm text-red-400">{failure}</p>}
      </div>
    </form>
  );
}

function Select({ name, label, placeholder, options }: { name: string; label: string; placeholder: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-body-muted">{label}</span>
      <select
        name={name}
        defaultValue=""
        className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5 text-sm text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-fill/20"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Input({ name, label, required, type = 'text', dir, error }: { name: string; label: string; required?: boolean; type?: string; dir?: 'ltr' | 'rtl'; error?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-body-muted">
        {label}
        {required && <span className="ms-1 text-brand">*</span>}
      </span>
      <input
        name={name}
        type={type}
        dir={dir}
        className={`w-full rounded-xl border bg-white/[0.02] px-4 py-3.5 text-sm text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-fill/20 ${error ? 'border-red-500' : 'border-white/10'} ${dir === 'ltr' ? 'text-start' : ''}`}
      />
      {error && <span className="mt-1 block text-[0.7rem] text-red-400">{error}</span>}
    </label>
  );
}
