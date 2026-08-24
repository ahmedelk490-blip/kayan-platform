import { NextResponse } from 'next/server';
import { createWebOrder, type WebOrderItem } from '@/lib/orders';

export const runtime = 'nodejs';

/**
 * استقبال طلب سلّة من الموقع العام — مسار كتابة بلا جلسة، مقيّد كالـleads.
 *
 * يُنشئ طلباً معلّقاً فقط (WebOrder بعدّة أصناف). لا فاتورة، لا وصول لأي كيان
 * آخر، تحقّق صارم، وحدّ معدّل.
 */

const PHONE = /^[+\d][\d\s()+.-]{6,}$/;
const MAX_ITEMS = 40;

type Rejection = { field: string; reason: string };

function validate(body: unknown):
  | { ok: true; value: { name: string; phone: string; company?: string; note?: string; items: WebOrderItem[] } }
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

  const name = text('name', true, 120);
  const phone = text('phone', true, 40);
  const company = text('company', false, 160);
  const note = text('note', false, 2000);
  if (phone && !PHONE.test(phone)) {
    errors.push({ field: 'phone', reason: 'Does not look like a phone number.' });
  }

  const items: WebOrderItem[] = [];
  const rawItems = raw.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    errors.push({ field: 'items', reason: 'Required.' });
  } else if (rawItems.length > MAX_ITEMS) {
    errors.push({ field: 'items', reason: `At most ${MAX_ITEMS} items.` });
  } else {
    for (const it of rawItems) {
      if (typeof it !== 'object' || it === null) continue;
      const r = it as Record<string, unknown>;
      const productId = typeof r.productId === 'string' ? r.productId.trim() : '';
      if (!productId || productId.length > 40) continue;
      const color = typeof r.color === 'string' ? r.color.trim().slice(0, 60) : undefined;
      const size = typeof r.size === 'string' ? r.size.trim().slice(0, 30) : undefined;
      const n = typeof r.quantity === 'number' ? r.quantity : Number(r.quantity);
      const quantity = Number.isFinite(n) && n >= 1 && n <= 100000 ? Math.floor(n) : 1;
      items.push({ productId, color: color || undefined, size: size || undefined, quantity });
    }
    if (items.length === 0) errors.push({ field: 'items', reason: 'No valid items.' });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, phone, company: company || undefined, note: note || undefined, items } };
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
      return NextResponse.json({ ok: false, errors: [{ field: 'items', reason: 'No valid products.' }] }, { status: 422 });
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
