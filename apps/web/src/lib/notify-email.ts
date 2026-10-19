import 'server-only';

import nodemailer from 'nodemailer';

/**
 * بريد إشعار للمصنع بطلبات الموقع (بطلب المالك).
 *
 * الإعداد من متغيّرات البيئة في hPanel فقط — لا كلمة مرور في الكود:
 *   SMTP_USER / SMTP_PASS  بريد على الدومين (مثل orders@kayan-uniform.com)
 *   SMTP_HOST / SMTP_PORT  افتراضياً smtp.hostinger.com:465
 *   NOTIFY_EMAIL           المستلم (افتراضياً نفس SMTP_USER)
 * بلا إعداد لا يُرسل شيء؛ الطلب محفوظ في النظام على أي حال.
 */
export async function notifyByEmail(subject: string, text: string): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return;

  try {
    const port = Number(process.env.SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.hostinger.com',
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10_000,
    });
    await transport.sendMail({
      from: `"موقع كيان" <${user}>`,
      to: process.env.NOTIFY_EMAIL ?? user,
      subject,
      text,
    });
  } catch (error) {
    console.error('[notify-email] تعذّر إرسال البريد', error);
  }
}
