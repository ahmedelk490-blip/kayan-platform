import { NextResponse } from 'next/server';
import { createWebOrder } from '@/lib/orders';

export const runtime = 'nodejs';

/**
 * استقبال طلب منتج من الموقع العام — ثاني مسار كتابة بلا جلسة، مقيّد كالـleads.
 *
 * يُنشئ طلباً معلّقاً فقط (WebOrder). لا فاتورة، لا وصول لأي كيان آخر، تحقّق
 * صارم، وحدّ معدّل أشدّ من أي مسار موثّق.
 */

const PHONE = /^[+\d][\d\s()+.-]{6,}$/;

type Rejection = { field: string; reason: string };

function validate(body: unknown):
  | { ok: true; value: { productId: string; color?: string; size?: string; quantity: number; name: string; phone: string; company?: string; note?: string } }
  | { ok: false; errors: Rejection[] } {
  const errors: Rejection[] = [];
  if (typeof body !== 'object' || body === null) {
    return { ok: false, errors: [{ field: '_', reason: 'Expected an object.' }] };
  }
  const raw = body as Record<string, unknown>;

  const text = (key: string, required: boolean, max: number) => {
    const v = raw[key];
    if (v === undefined || v === null || v === '') {
      if (required) errors.push({ field: key, reason: 'Required.' });
      return '';
    }
    if (typeof v !== 'string') {
      errors.push({ field: key, reason: 'Must be text.' });
      return '';
    }
    const t = v.trim();
    if (t.length > max) {
      errors.push({ field: key, reason: `Must be ${max} characters or fewer.` });
      return '';
    }
    return t;
  };

  const productId = text('productId', true, 40);
  const name = text('name', true, 120);
  const phone = text('phone', true, 40);
  const company = text('company', false, 160);
  const color = text('color', false, 60);
  const size = text('size', false, 30);
  const note = text('note', false, 2000);

  if (phone && !PHONE.test(phone)) {
    errors.push({ field: 'phone', reason: 'Does not look like a phone number.' });
  }

  let quantity = 1;
  const q = raw.quantity;
  const n = typeof q === 'number' ? q : Number(q);
  if (!Number.isFinite(n) || n < 1 || n > 100000) {
    errors.push({ field: 'quantity', reason: 'Must be a whole number of 1 or more.' });
  } else {
    quantity = Math.floor(n);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { productId, color: color || undefined, size: size || undefined, quantity, name, phone, company: company || undefined, note: note || undefined } };
}

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (entry.count >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export async function POST(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const client = forwarded?.split(',')[0]?.trim() || 'unknown';

  const limit = rateLimit(client);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many submissions. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const result = validate(body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 422 });
  }

  try {
    const created = await createWebOrder(result.value);
    if (!created.ok) {
      return NextResponse.json({ ok: false, errors: [{ field: 'productId', reason: 'Product not found.' }] }, { status: 422 });
    }
    return NextResponse.json({ ok: true, number: created.number }, { status: 201 });
  } catch (error) {
    console.error('[orders] failed to persist order', error);
    return NextResponse.json(
      { ok: false, error: 'We could not record that. Please contact us directly.' },
      { status: 500 },
    );
  }
}
