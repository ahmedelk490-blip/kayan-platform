import 'server-only';
import { createHash } from 'node:crypto';
import { trackingIds } from './tracking';

/**
 * واجهة التحويلات (Conversions API) — الخادم يرسل أحداث الطلب إلى Meta بنفسه،
 * فتصل ولو حجب متصفح الزبون البكسل. الرمز سرّ: يُقرأ من متغيّر البيئة
 * META_CAPI_TOKEN على الخادم (لوحة Hostinger) ولا يُكتب في الكود أبداً.
 *
 * كل حدث يحمل event_id يرسله المتصفح بنفسه أيضاً، فتعدّه Meta مرة واحدة.
 */

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** رقم عراقي بصيغة دولية بلا «+» (07xx → 9647xx) — الصيغة التي تطابقها Meta. */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `964${digits.slice(1)}`;
  return digits;
}

export interface CapiEvent {
  name: 'Purchase' | 'Lead' | 'CompleteRegistration' | 'AddPaymentInfo';
  eventId: string;
  phone?: string;
  custom?: Record<string, unknown>;
}

/** يرسل الأحداث إلى Meta؛ يصمت إن لم يُضبط الرمز ولا يعطّل الطلب أبداً. */
export async function sendCapiEvents(request: Request, events: CapiEvent[]): Promise<void> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token || events.length === 0) return;
  // معرّف البكسل من «أكواد التتبّع» في النظام — نفس ما يحمّله المتصفح.
  const { metaPixelId } = await trackingIds();
  if (!metaPixelId) return;

  const headers = request.headers;
  const cookie = headers.get('cookie') ?? '';
  const fbp = /(?:^|;\s*)_fbp=([^;]+)/.exec(cookie)?.[1];
  const fbc = /(?:^|;\s*)_fbc=([^;]+)/.exec(cookie)?.[1];
  const userData = {
    client_ip_address: headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    client_user_agent: headers.get('user-agent') || undefined,
    fbp,
    fbc,
  };

  const data = events.map((e) => ({
    event_name: e.name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: e.eventId,
    action_source: 'website',
    event_source_url: headers.get('referer') || undefined,
    user_data: { ...userData, ...(e.phone ? { ph: [sha256(normalizePhone(e.phone))] } : {}) },
    custom_data: e.custom,
  }));

  try {
    const res = await fetch(
      `https://graph.facebook.com/v26.0/${metaPixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) console.error('[meta-capi] rejected', res.status, (await res.text()).slice(0, 300));
  } catch (error) {
    console.error('[meta-capi] failed', String(error).slice(0, 200));
  }
}
