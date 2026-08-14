import { NextResponse } from 'next/server';
import { createLead } from '@/lib/leads';

export const runtime = 'nodejs';

/**
 * Public lead intake — the ONLY unauthenticated write path in the system
 * (03_System_Architecture §21.2).
 *
 * Constraints that hold here and must keep holding:
 *   - creates unqualified leads and nothing else, ever
 *   - no access to any other entity, no general API, no direct DB access
 *   - strict schema: reject rather than coerce
 *   - rate limited per client, stricter than any authenticated endpoint
 *
 * Submissions now create a real Customer with an INQUIRY activity, in the
 * same database the ERP reads. The interim JSONL file is gone: it lived
 * beside the deployment, unencrypted and invisible to everyone inside the
 * system, so a manager had to open a file on the server to learn that
 * somebody had asked for a quote.
 *
 * It deliberately stops at an unqualified customer. A quotation carries
 * prices and terms, and nobody can price a request they have not read yet —
 * so sales opens the quotation after review. See lib/leads.ts.
 */

const MAX_LENGTHS = {
  name: 120,
  company: 160,
  email: 254,
  phone: 40,
  message: 4000,
} as const;

const ALLOWED_INTERESTS = ['printing', 'embroidery', 'uniforms', 'safety'] as const;

// Deliberately conservative: a syntactic check only. Address validity is
// proven by a human replying, not by a regex.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Equally conservative: digits, spaces and the punctuation international
// numbers actually contain. Deliberately not a country-specific pattern —
// rejecting a valid foreign number loses a customer to satisfy a regex.
const PHONE = /^[+\d][\d\s()+.-]{6,}$/;

type Rejection = { field: string; reason: string };

interface Lead {
  name: string;
  company: string;
  email: string;
  phone: string;
  interests: string[];
  message: string;
}

function validate(body: unknown): { ok: true; lead: Lead } | { ok: false; errors: Rejection[] } {
  const errors: Rejection[] = [];

  if (typeof body !== 'object' || body === null) {
    return { ok: false, errors: [{ field: '_', reason: 'Expected an object.' }] };
  }
  const raw = body as Record<string, unknown>;

  const str = (key: keyof typeof MAX_LENGTHS, required: boolean) => {
    const value = raw[key];
    if (value === undefined || value === null || value === '') {
      if (required) errors.push({ field: key, reason: 'Required.' });
      return '';
    }
    if (typeof value !== 'string') {
      errors.push({ field: key, reason: 'Must be text.' });
      return '';
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_LENGTHS[key]) {
      errors.push({ field: key, reason: `Must be ${MAX_LENGTHS[key]} characters or fewer.` });
      return '';
    }
    return trimmed;
  };

  // Phase 8 reversed which contact field is mandatory. Business asks for a
  // mobile number: this market replies on WhatsApp, and a required email
  // loses enquiries from people who simply do not use one. Email stays
  // accepted and still format-checked when supplied.
  const name = str('name', true);
  const phone = str('phone', true);
  const company = str('company', false);
  const email = str('email', false);
  const message = str('message', false);

  if (phone && !PHONE.test(phone)) {
    errors.push({ field: 'phone', reason: 'Does not look like a phone number.' });
  }

  if (email && !EMAIL.test(email)) {
    errors.push({ field: 'email', reason: 'Does not look like an email address.' });
  }

  let interests: string[] = [];
  if (raw.interests !== undefined) {
    if (!Array.isArray(raw.interests)) {
      errors.push({ field: 'interests', reason: 'Must be a list.' });
    } else {
      const invalid = raw.interests.filter(
        (i) => typeof i !== 'string' || !ALLOWED_INTERESTS.includes(i as never),
      );
      if (invalid.length) {
        errors.push({ field: 'interests', reason: 'Contains an unrecognised value.' });
      } else {
        interests = [...new Set(raw.interests as string[])];
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, lead: { name, company, email, phone, interests, message } };
}

/**
 * In-memory fixed-window rate limit.
 *
 * Per-process, so it does not hold across horizontally scaled instances —
 * adequate for a single-instance marketing site, and replaced by the shared
 * Redis limiter when the ERP API takes over intake.
 */
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

  const record = {
    ...result.lead,
    receivedAt: new Date().toISOString(),
    source: 'marketing-site',
    status: 'UNQUALIFIED',
    client,
  };

  try {
    await createLead(record);
  } catch (error) {
    console.error('[leads] failed to persist submission', error);
    return NextResponse.json(
      { ok: false, error: 'We could not record that. Please email us directly.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
