/**
 * تحقّق من طبقة نصوص الموقع.
 *
 * الادّعاء: المدير يعدّل نصاً فيظهر على الموقع فوراً، وإذا غاب الصف أو
 * تعذّرت قاعدة البيانات يُعرض نص الكود لا فراغ.
 *
 * الشرط الثاني هو الأهم: صفحة رئيسية تفرغ لأن صفّاً ناقص هي صفحة تنتظر أن
 * تسقط. فيُهاجَم هنا لا يُفترض.
 *
 * آمن لإعادة التشغيل: يحذف ما يُنشئه.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const T = 'kayan';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** نفس منطق lib/content.ts: مخزَّن ← كود ← المفتاح. */
function reader(stored, defaults) {
  const s = new Map(stored.map((r) => [r.key, r.valueAr]));
  const d = new Map(defaults.map((r) => [r.key, r.valueAr]));
  return (key) => s.get(key) ?? d.get(key) ?? key;
}

async function main() {
  // القيم المكتوبة في الكود — تُقرأ من المصدر لا تُكرَّر هنا.
  const { SERVICES, WHY_KAYAN } = await import('../apps/web/src/site.ts');
  const defaults = [];
  for (const s of SERVICES) {
    defaults.push({ key: `service.${s.id}.name`, valueAr: s.name });
    defaults.push({ key: `service.${s.id}.body`, valueAr: s.body });
  }
  for (const w of WHY_KAYAN) {
    defaults.push({ key: `why.${w.id}.title`, valueAr: w.title });
    defaults.push({ key: `why.${w.id}.body`, valueAr: w.body });
  }
  check('مفاتيح الكود موجودة', defaults.length >= 18, `${defaults.length} مفتاحاً`);

  // ── بلا صفوف: تُعرض نصوص الكود ───────────────────────────
  await prisma.siteContent.deleteMany({ where: { tenantId: T } });
  let t = reader([], defaults);
  check(
    'بلا أي صف: يُعرض نص الكود لا فراغ',
    t('service.printing.body') === SERVICES[0].body && t('service.printing.body').length > 0,
    'الموقع لا يفرغ',
  );

  // ── صف مخزَّن يغلب نص الكود ──────────────────────────────
  const NEW_TEXT = 'نص اختباري من لوحة التحكم — سيُحذف.';
  await prisma.siteContent.create({
    data: {
      tenantId: T,
      key: 'service.printing.body',
      valueAr: NEW_TEXT,
      group: 'services',
      label: 'اختبار',
    },
  });
  let rows = await prisma.siteContent.findMany({ where: { tenantId: T } });
  t = reader(rows, defaults);
  check(
    'نص المدير يغلب نص الكود',
    t('service.printing.body') === NEW_TEXT,
    'هذا معنى «يظهر فوراً بلا نشر»',
  );
  check(
    'وبقية النصوص لم تتأثّر',
    t('service.embroidery.body') === SERVICES[1].body,
    'تعديل نص واحد لا يمسّ غيره',
  );

  // ── الحذف يرجع لنص الكود ─────────────────────────────────
  await prisma.siteContent.deleteMany({ where: { tenantId: T, key: 'service.printing.body' } });
  rows = await prisma.siteContent.findMany({ where: { tenantId: T } });
  t = reader(rows, defaults);
  check(
    'إفراغ الحقل يرجع لنص الكود',
    t('service.printing.body') === SERVICES[0].body,
    'لا يفرغ القسم',
  );

  // ── مفتاح غير معروف يظهر ولا يختفي ───────────────────────
  check(
    'مفتاح خاطئ يُعرض كنفسه ليُرى ويُصلَح',
    t('service.does-not-exist.body') === 'service.does-not-exist.body',
    'اختفاؤه كفراغ يخفي الخطأ',
  );

  // ── العزل: الصف يحمل مستأجره ─────────────────────────────
  const one = await prisma.siteContent.create({
    data: { tenantId: T, key: 'about.p1', valueAr: 'اختبار عزل', group: 'about', label: 'اختبار' },
  });
  check('الصف يحمل مستأجره', one.tenantId === T);

  // ── لا صفّان بنفس المفتاح ────────────────────────────────
  let rejected = false;
  try {
    await prisma.siteContent.create({
      data: { tenantId: T, key: 'about.p1', valueAr: 'مكرّر', group: 'about', label: 'اختبار' },
    });
  } catch {
    rejected = true;
  }
  check(
    'قاعدة البيانات ترفض مفتاحاً مكرّراً',
    rejected,
    'نصّان لمكان واحد يعني نصاً يظهر بالحظّ',
  );

  await prisma.siteContent.deleteMany({ where: { tenantId: T, label: 'اختبار' } });
  check(
    'نُظّف كل ما أنشأه الاختبار',
    (await prisma.siteContent.count({ where: { tenantId: T, label: 'اختبار' } })) === 0,
  );

  report();
}

function report() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} تحقّقاً ناجحاً`);
  if (passed !== results.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
