/**
 * إنهاء ناتج standalone — نسخ ما لا ينسخه Next.
 *
 * `output: 'standalone'` يكتب الخادم وشجرة الوحدات التي يحتاجها فعلاً، ولا
 * ينسخ اثنين: `.next/static` و`public`. هذا سلوك موثَّق في Next لا خطأ فيه،
 * لأن كثيراً من المنصّات تخدم الأصول من CDN لا من الخادم.
 *
 * وهوستنجر ليس منها. بلا هذه الخطوة ينجح النشر ويطلع الموقع بلا تنسيق ولا
 * جافاسكربت ولا صورة واحدة — 2.2 ميجا أصول و3.3 ميجا صور مفقودة، وصفحة
 * تبدو مكسورة تماماً. وهذا أسوأ من فشل معلن، لأن الفشل المعلن يُقرأ.
 *
 * ── لماذا يُبحث عن server.js ولا يُفترض مساره ──────────────
 *
 * عمق التداخل داخل standalone يتبع `outputFileTracingRoot`: جذر المستودع
 * يعني `standalone/apps/web/server.js`، وتغييره يحرّك المسار. كتابة المسار
 * هنا نصاً تعني أن تعديل الإعداد يكسر النسخ بصمت — البناء ينجح والأصول
 * تذهب لمكان لا أحد يقرأ منه. فيُبحث عن الخادم ويُبنى المسار حوله.
 *
 * آمن لإعادة التشغيل: النسخ يستبدل ما وجد.
 */
import { cpSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(appDir, '.next', 'standalone');

if (!existsSync(standalone)) {
  console.error(
    'لا يوجد .next/standalone — تأكّد أن output: \'standalone\' مضبوط في next.config.ts',
  );
  process.exit(1);
}

/** أول server.js في الشجرة، عدا ما داخل node_modules (فيها server.js كثيرة). */
function findServer(dir, depth = 0) {
  if (depth > 5) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name === 'server.js') return full;
    if (entry.isDirectory()) {
      const found = findServer(full, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const server = findServer(standalone);
if (!server) {
  console.error('لم يُعثر على server.js داخل standalone — الناتج غير سليم');
  process.exit(1);
}

// المجلد الذي يعمل الخادم منه. الأصول تُوضع بالنسبة إليه لا بالنسبة لأي
// مسار مفترض.
const serverRoot = dirname(server);

const copies = [
  { from: join(appDir, '.next', 'static'), to: join(serverRoot, '.next', 'static') },
  { from: join(appDir, 'public'), to: join(serverRoot, 'public') },
];

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    console.error(`مصدر مفقود: ${relative(appDir, from)}`);
    process.exit(1);
  }
  cpSync(from, to, { recursive: true });
  if (!existsSync(to)) {
    console.error(`فشل النسخ إلى ${relative(standalone, to)}`);
    process.exit(1);
  }
  console.log(`  ${relative(appDir, from)} → standalone/${relative(standalone, to)}`);
}

/**
 * جسر في جذر standalone.
 *
 * الخادم متداخل، ومنصّات النشر تختلف: بعضها يبحث عن `server.js` في الجذر،
 * وبعضها يستكشف الشجرة. هذا السطر يجعل الحالتين تعملان.
 *
 * ولا يكرّر شيئاً: خادم Next المولَّد يُنفّذ `process.chdir(__dirname)` عند
 * إقلاعه، فيصحّح مجلده بنفسه بعد أن يُستدعى من هنا.
 */
const bridge = join(standalone, 'server.js');
if (server !== bridge) {
  const target = relative(standalone, server).split('\\').join('/');
  writeFileSync(
    bridge,
    `// مولَّد آلياً — لا يُحرَّر. الخادم الحقيقي في ${target}\n` +
      `// يُقلع من هناك، وهو يضبط مجلد عمله بنفسه عبر process.chdir.\n` +
      `import('./${target}');\n`,
    'utf8',
  );
  console.log(`  جسر: standalone/server.js → ${target}`);
}

// تحقّق أخير: ملف واحد حقيقي من كل مصدر، لا وجود المجلد فقط. مجلد فارغ
// يمرّ على فحص الوجود ويسقط الموقع.
const staticFiles = readdirSync(join(serverRoot, '.next', 'static'), { recursive: true }).filter(
  (f) => statSync(join(serverRoot, '.next', 'static', String(f))).isFile(),
);
if (staticFiles.length === 0) {
  console.error('static فارغ — الموقع سيطلع بلا تنسيق');
  process.exit(1);
}

console.log(`✓ standalone جاهز — ${staticFiles.length} ملف أصول`);
