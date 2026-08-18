/**
 * فحص كل مسار على الخادم المبني.
 *
 * الادّعاء: كل صفحة في المنصّة تُفتح فعلاً — العامة لأي زائر، وصفحات النظام
 * لصاحب الصلاحية وحده.
 *
 * ── لماذا على الخادم المبني لا خادم التطوير ────────────────
 *
 * الخلل الذي أسقط الصفحة الرئيسية بـ500 — دالة تُمرَّر لمكوّن عميل — عبر
 * البناء كاملاً بلا أي تحذير، لأنه يقع وقت الطلب لا وقت البناء. فحصٌ يقرأ
 * الكود أو يبني فقط كان سيمرّ عليه، وفحصٌ يطلب الصفحة يمسكه.
 *
 * الجلسة تُصنع في القاعدة مباشرة لا عبر نموذج الدخول: التوكن عشوائي ولا
 * تُخزَّن منه إلا بصمته، فيكفي أن نكتب البصمة ونحمل التوكن في الكوكي — نفس
 * ما يفعله `createSession` بالضبط.
 *
 * آمن لإعادة التشغيل: الجلسات التي يصنعها تُلغى في النهاية.
 */
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.PROBE_URL ?? 'http://127.0.0.1:3396';
const COOKIE = 'kayan_session';

const auth = new PrismaClient({ datasources: { db: { url: process.env.AUTH_DATABASE_URL } } });

/** مسارات الموقع العام — بلا جلسة. */
const PUBLIC = ['/', '/about', '/products', '/services', '/contact', '/login', '/legal/privacy', '/legal/terms', '/robots.txt', '/sitemap.xml'];

/** مسارات النظام — بجلسة المدير. */
const ERP = [
  '/dashboard', '/sales', '/sales/quotations', '/sales/orders', '/catalog/products',
  '/catalog/products/new', '/inventory', '/warehouses', '/requests', '/customers',
  '/customers/new', '/suppliers', '/suppliers/new', '/purchasing', '/purchasing/new',
  '/invoices', '/manufacturing', '/manufacturing/new', '/formulas',
  '/formulas/new', '/supplies', '/expenses', '/damage', '/damage/new', '/reports',
  '/reports/inventory', '/reports/production', '/reports/profitability', '/reports/sales',
  '/users', '/content', '/settings', '/requests/export',
];

/**
 * فصل الأدوار — من يفتح ماذا، ومن يُمنع.
 *
 * `/portal` للعميل و`/admin` لمدير النظام، وكلاهما محجوب عن المدير عمداً:
 * بوابة العميل ليست شاشته، ولوحة الإدارة تمنح الصلاحيات فلا تُفتح لمن
 * يستطيع منح نفسه بها.
 *
 * المنع هنا مقيس لا مفترض. فحص يتحقّق من الفتح وحده يمرّ على نظام يفتح كل
 * شيء لكل أحد.
 */
const ROLE_ROUTES = [
  { path: '/portal', allowed: 'CUSTOMER', denied: 'MANAGER' },
  { path: '/admin', allowed: 'ADMIN', denied: 'MANAGER' },
];

/** يجب أن تُحجب بلا جلسة — صفحة تفتح للجميع أخطر من صفحة لا تفتح. */
const MUST_GUARD = ['/dashboard', '/users', '/settings', '/content', '/reports/profitability', '/requests/export'];

const fails = [];
const ok = [];

async function probe(path, cookie) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {},
  });
  const body = res.status === 200 ? await res.text() : '';
  return { status: res.status, location: res.headers.get('location'), body };
}

async function main() {
  const user = await auth.user.findFirst({
    where: { email: 'kayan@kayan-uniform.com' },
    include: { role: true },
  });
  if (!user) throw new Error('حساب المدير kayan@kayan-uniform.com غير موجود');
  console.log(`المدير: ${user.email} · ${user.role.key}\n`);

  const token = randomBytes(32).toString('base64url');
  const session = await auth.session.create({
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3_600_000),
      userAgent: 'verify-routes',
    },
  });

  console.log('── الموقع العام (بلا جلسة) ──────────────────────');
  for (const path of PUBLIC) {
    const { status, body } = await probe(path);
    // 200 وحده لا يكفي: Next يردّ 200 مع صفحة خطأ في بعض الحالات.
    const broken = status === 200 && /Application error|حدث خطأ غير متوقّع/.test(body);
    const good = status === 200 && !broken;
    (good ? ok : fails).push(path);
    console.log(`  ${good ? '✓' : '✗'} ${path.padEnd(18)} ${status}${broken ? ' — صفحة خطأ داخل 200' : ''}`);
  }

  console.log('\n── الحجب بلا جلسة ───────────────────────────────');
  for (const path of MUST_GUARD) {
    const { status, location } = await probe(path);
    // تحويل إلى /login أو رفض. 200 هنا تسريب.
    const guarded = status !== 200;
    (guarded ? ok : fails).push(`حجب ${path}`);
    console.log(`  ${guarded ? '✓' : '✗'} ${path.padEnd(26)} ${status}${location ? ` → ${location}` : ''}${guarded ? '' : '  ⚠ مفتوحة بلا تسجيل دخول'}`);
  }

  console.log('\n── النظام (بجلسة المدير) ────────────────────────');
  for (const path of ERP) {
    const { status, body } = await probe(path, token);
    const broken = status === 200 && /Application error|حدث خطأ غير متوقّع/.test(body);
    const good = status === 200 && !broken;
    (good ? ok : fails).push(path);
    console.log(`  ${good ? '✓' : '✗'} ${path.padEnd(30)} ${status}${broken ? ' — صفحة خطأ داخل 200' : ''}`);
  }

  console.log('\n── فصل الأدوار ──────────────────────────────────');
  const minted = [session.id];
  for (const { path, allowed, denied } of ROLE_ROUTES) {
    const holder = await auth.user.findFirst({
      where: { role: { key: allowed }, isActive: true },
      select: { id: true, email: true },
    });
    if (!holder) {
      fails.push(`${path} — لا حساب بدور ${allowed}`);
      console.log(`  ✗ ${path.padEnd(10)} لا يوجد حساب بدور ${allowed} لاختباره`);
      continue;
    }

    const t = randomBytes(32).toString('base64url');
    const s = await auth.session.create({
      data: {
        tokenHash: createHash('sha256').update(t).digest('hex'),
        userId: holder.id,
        expiresAt: new Date(Date.now() + 3_600_000),
        userAgent: 'verify-routes',
      },
    });
    minted.push(s.id);

    const open = await probe(path, t);
    const shut = await probe(path, token); // جلسة المدير

    const good = open.status === 200 && shut.status !== 200;
    (good ? ok : fails).push(`دور ${path}`);
    console.log(
      `  ${good ? '✓' : '✗'} ${path.padEnd(10)} ${allowed} ${open.status}` +
        ` · ${denied} ${shut.status}${shut.status === 200 ? '  ⚠ يفتحها ولا يملكها' : ' (ممنوع)'}`,
    );
  }

  await auth.session.updateMany({
    where: { id: { in: minted } },
    data: { revokedAt: new Date() },
  });

  console.log(`\n${ok.length}/${ok.length + fails.length} مساراً سليماً`);
  if (fails.length) {
    console.log('فشل:', fails.join(' · '));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => auth.$disconnect());
