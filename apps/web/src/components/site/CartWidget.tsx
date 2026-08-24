'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { subscribe, getSnapshot, setQty, removeItem, clearCart, type CartItem } from '@/lib/cart';

/**
 * أيقونة السلة العائمة فوق زرّ الواتساب + لوحة السلة والدفع.
 *
 * تظهر فقط حين تحوي السلة أصنافاً. العميل يفتحها، يراجع أصنافه، يكتب بياناته،
 * ويُتمّ الطلب — فيصل للـERP كطلب واحد بعدّة أصناف يحوّله المندوب لفاتورة.
 */
// لقطة خادم ثابتة المرجع — مصفوفة جديدة كل نداء تُطلق حلقة لا نهائية.
const SERVER_EMPTY: CartItem[] = [];

export function CartWidget() {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_EMPTY);
  const [open, setOpen] = useState(false);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  // «اشترِ الآن» في صفحة المنتج يُضيف ثم يفتح اللوحة عبر هذا الحدث.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener('kayan-cart-open', openIt);
    return () => window.removeEventListener('kayan-cart-open', openIt);
  }, []);

  if (count === 0 && !open) return null;

  return (
    <>
      {/* الأيقونة العائمة — فوق زرّ الواتساب (bottom-6) بمسافة. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`السلة — ${count} صنف`}
        className="group fixed bottom-24 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-fill text-on-brand shadow-[0_10px_30px_-8px_rgba(0,0,0,0.55)] transition-transform hover:scale-105"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -start-1 grid h-6 min-w-6 place-items-center rounded-full bg-white px-1 text-xs font-bold text-brand shadow">
            {count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && <CartDrawer items={items} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

function CartDrawer({ items, onClose }: { items: CartItem[]; onClose: () => void }) {
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [orderNo, setOrderNo] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0) return;
    setStatus('sending');
    setErrors({});
    setFailure('');
    const form = new FormData(e.currentTarget);

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: String(form.get('name') ?? ''),
        phone: String(form.get('phone') ?? ''),
        company: String(form.get('company') ?? ''),
        note: String(form.get('note') ?? ''),
        items: items.map((i) => ({
          productId: i.productId,
          color: i.colorLabel || undefined,
          size: i.sizeLabel || undefined,
          quantity: i.quantity,
        })),
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
      clearCart();
      return;
    }
    if (res.status === 429) {
      setStatus('error');
      setFailure('طلبات كثيرة في وقت قصير. انتظر دقيقة وحاول مرة ثانية.');
      return;
    }
    const body = await res.json().catch(() => null);
    const mapped: Record<string, string> = {};
    for (const it of body?.errors ?? []) {
      mapped[it.field] =
        it.reason === 'Required.' ? 'هذا الحقل مطلوب.'
        : it.reason === 'Does not look like a phone number.' ? 'رقم الجوال ما يبدو صحيحاً.'
        : it.reason;
    }
    setErrors(mapped);
    setStatus('error');
    if (Object.keys(mapped).length === 0) setFailure('صار خطأ. حاول مرة ثانية.');
  }

  return (
    <motion.div className="fixed inset-0 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="absolute inset-y-0 start-0 flex w-full max-w-[420px] flex-col border-e border-edge bg-panel"
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-base font-bold text-body">سلّة الطلب</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-full border border-edge-strong text-body-muted hover:text-body">✕</button>
        </div>

        {status === 'sent' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-ok text-2xl text-white">✓</div>
            <p className="text-lg font-bold text-body">تم إرسال طلبك</p>
            <p className="text-sm leading-[1.9] text-body-muted">
              رقم الطلب <span dir="ltr" className="font-bold text-brand">{orderNo}</span> — بنراجعه ونتواصل معك على رقمك بالتسعيرة والتفاصيل.
            </p>
            <button type="button" onClick={onClose} className="mt-2 rounded-full bg-brand-fill px-7 py-3 text-sm font-bold text-on-brand">تمام</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <p className="py-16 text-center text-sm text-body-muted">السلّة فارغة.</p>
              ) : (
                <ul className="space-y-3">
                  {items.map((i) => (
                    <li key={i.key} className="flex gap-3 rounded-2xl border border-edge bg-panel-2/50 p-3">
                      {i.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div className="h-16 w-16 shrink-0 rounded-xl bg-panel-2" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-body">{i.productName}</p>
                        <p className="mt-0.5 text-xs text-body-muted">
                          {[i.colorLabel, i.sizeLabel].filter(Boolean).join(' · ') || '—'}
                          {i.priceText ? <span className="ms-2 text-brand">{i.priceText}</span> : null}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex items-center rounded-lg border border-edge-strong">
                            <button type="button" aria-label="أنقص" onClick={() => setQty(i.key, i.quantity - 1)} className="px-2.5 py-1 text-body-muted hover:text-body">−</button>
                            <span className="tnum min-w-8 text-center text-sm text-body">{i.quantity}</span>
                            <button type="button" aria-label="زد" onClick={() => setQty(i.key, i.quantity + 1)} className="px-2.5 py-1 text-body-muted hover:text-body">+</button>
                          </div>
                          <button type="button" onClick={() => removeItem(i.key)} className="text-xs text-red-400 hover:underline">حذف</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <form onSubmit={onSubmit} noValidate className="border-t border-edge px-5 py-4">
                <p className="mb-3 text-xs font-semibold text-body">أكمل بياناتك لإتمام الطلب</p>
                <div className="grid gap-3">
                  <Field name="name" label="الاسم" required error={errors.name} />
                  <Field name="phone" label="رقم الجوال" required type="tel" dir="ltr" error={errors.phone} />
                  <Field name="company" label="اسم الشركة (اختياري)" error={errors.company} />
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-body-muted">ملاحظات (المقاسات، مكان الشعار…)</span>
                    <textarea name="note" rows={2} className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-sm text-body outline-none focus:border-brand focus:ring-2 focus:ring-brand-fill/20" />
                  </label>
                </div>
                {status === 'error' && failure && <p role="alert" className="mt-2 text-xs text-red-400">{failure}</p>}
                <button type="submit" disabled={status === 'sending'} className="mt-4 w-full rounded-full bg-brand-fill py-3.5 text-sm font-bold text-on-brand shadow-[0_16px_36px_-16px_rgba(92,35,52,0.9)] transition-opacity hover:opacity-95 disabled:opacity-60">
                  {status === 'sending' ? 'جارٍ الإرسال…' : 'إتمام الطلب'}
                </button>
              </form>
            )}
          </>
        )}
      </motion.aside>
    </motion.div>
  );
}

function Field({ name, label, required, type = 'text', dir, error }: { name: string; label: string; required?: boolean; type?: string; dir?: 'ltr' | 'rtl'; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-body-muted">
        {label}
        {required && <span className="ms-1 text-brand">*</span>}
      </span>
      <input
        name={name}
        type={type}
        dir={dir}
        className={`w-full rounded-xl border bg-white/[0.02] px-3.5 py-2.5 text-sm text-body outline-none focus:border-brand focus:ring-2 focus:ring-brand-fill/20 ${error ? 'border-red-500' : 'border-white/10'} ${dir === 'ltr' ? 'text-start' : ''}`}
      />
      {error && <span className="mt-1 block text-[0.7rem] text-red-400">{error}</span>}
    </label>
  );
}
