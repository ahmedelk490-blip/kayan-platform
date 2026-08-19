/**
 * تحقّق من دورة حياة شرائح الواجهة كاملةً.
 *
 * الادّعاء: صورة تُرفع من النظام تُعالَج وتُخزَّن بايتات في القاعدة، وتخرج
 * من مسارها بنفس النوع، وتظهر في القراءة العامة مرتّبةً وبالنشطة وحدها.
 *
 * يحاكي ما يفعله الإجراء الخادمي: يقرأ صورة منتج حقيقية من القرص، يمرّرها
 * على sharp كما يفعل الرفع، يكتب الصفّ، ثم يقرأ كما يقرأ المسار والصفحة.
 *
 * آمن لإعادة التشغيل: يحذف ما يُنشئه.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const root = fileURLToPath(new URL('..', import.meta.url));
const prisma = new PrismaClient({ log: [] });
const T = 'kayan';
const MARK = `HEROTEST-${Date.now()}`;
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function process(path) {
  const input = readFileSync(path);
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

async function main() {
  const src = join(root, 'apps/web/public/products/vest-turkish/vest-turkish-001/01.webp');
  const original = readFileSync(src);
  const img = await process(src);

  check('المعالجة أنتجت webp', img.bytes.subarray(8, 12).toString() === 'WEBP', `${img.width}×${img.height}`);
  check('الحجم انضبط تحت العرض الأقصى', img.width <= 1400, `العرض ${img.width}`);

  // ── الكتابة كما يكتب الإجراء ─────────────────────────────
  const last = await prisma.heroSlide.findFirst({
    where: { tenantId: T },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const base = (last?.sortOrder ?? 0) + 1;

  const a = await prisma.heroSlide.create({
    data: {
      tenantId: T, title: `${MARK} أولى`, subtitle: 'يلك تركي',
      image: img.bytes, mimeType: 'image/webp', width: img.width, height: img.height,
      sortOrder: base, isActive: true,
    },
    select: { id: true },
  });
  const b = await prisma.heroSlide.create({
    data: {
      tenantId: T, title: `${MARK} ثانية`, subtitle: '',
      image: img.bytes, mimeType: 'image/webp', width: img.width, height: img.height,
      sortOrder: base + 1, isActive: false,
    },
    select: { id: true },
  });
  check('شريحتان كُتبتا', Boolean(a.id && b.id));

  // ── القراءة كما يقرأ المسار: البايتات تعود سليمة ─────────
  const served = await prisma.heroSlide.findFirst({
    where: { id: a.id, tenantId: T },
    select: { image: true, mimeType: true },
  });
  const back = Buffer.from(served.image);
  check('البايتات تعود من القاعدة كما كُتبت', back.equals(img.bytes), `${back.length} بايت`);
  check('النوع محفوظ', served.mimeType === 'image/webp');
  check(
    'الصورة المخزَّنة أخفّ من الأصل أو مساوية',
    back.length <= original.length,
    `${back.length} ≤ ${original.length}`,
  );

  // ── القراءة العامة: النشطة وحدها، مرتّبة، بلا بايتات ──────
  const publicRows = await prisma.heroSlide.findMany({
    where: { tenantId: T, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, width: true },
  });
  const mine = publicRows.filter((r) => r.title.startsWith(MARK));
  check('القراءة العامة ترى النشطة فقط', mine.length === 1 && mine[0].id === a.id, `${mine.length} نشطة`);

  // ── التفعيل يُظهر المعطّلة ───────────────────────────────
  await prisma.heroSlide.updateMany({ where: { id: b.id, tenantId: T }, data: { isActive: true } });
  const after = await prisma.heroSlide.count({ where: { tenantId: T, isActive: true, title: { startsWith: MARK } } });
  check('تفعيل شريحة يُدرجها في العرض', after === 2, `${after} نشطة`);

  // ── الحذف يحرّر بايتاتها ─────────────────────────────────
  await prisma.heroSlide.deleteMany({ where: { tenantId: T, title: { startsWith: MARK } } });
  const remaining = await prisma.heroSlide.count({ where: { tenantId: T, title: { startsWith: MARK } } });
  check('الحذف يزيل الشرائح وبايتاتها', remaining === 0);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} تحقّقاً ناجحاً`);
  if (passed !== results.length) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e.message.split('\n').slice(0, 4).join('\n'));
    await prisma.heroSlide.deleteMany({ where: { tenantId: T, title: { startsWith: MARK } } }).catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
