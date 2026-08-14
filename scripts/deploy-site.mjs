/**
 * نشر الموقع التسويقي على هوستنجر — أمر واحد.
 *
 *   node scripts/deploy-site.mjs          نشر
 *   node scripts/deploy-site.mjs --deps   نشر مع إعادة تثبيت الحزم
 *
 * ── لماذا يُبنى محلياً ثم يُرفع الناتج ─────────────────────
 *
 * الاستضافة المشتركة لا تستطيع بناء Next: حدّ العمليات في CloudLinux يوقف
 * `next build` بـ EAGAIN عند إطلاق أول عامل، وجرّبتُ ذلك مرتين بما في ذلك
 * مع `cpus: 1`. لكن `npm install` ينجح عليها، فالملفات الثنائية الأصلية
 * تُختار على لينكس كما يجب.
 *
 * فالتقسيم: البناء هنا، والتثبيت هناك. مخرجات `.next` جافاسكربت مستقل عن
 * نظام التشغيل، لذلك رفعها آمن — بشرط تطابق إصدارات الحزم، وهو ما يتحقّق
 * منه هذا السكربت قبل أن يلمس الخادم.
 *
 * ── لماذا لا يُستبدل .next في مكانه ────────────────────────
 *
 * استبدال مباشر يترك الموقع بمجلد نصفه قديم ونصفه جديد لثوانٍ، وأي طلب في
 * تلك اللحظة يحصل على صفحة مكسورة. فيُرفع إلى `.next.new` ثم يُبدَّل
 * بحركتَي `mv` متتاليتين، وهي أقرب ما يمكن للتبديل الذرّي على نظام ملفات
 * عادي. النسخة القديمة تبقى `.next.old` حتى ينجح التحقّق.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HOST = '185.206.160.134';
const PORT = '65002';
const USER = 'u257117736';
const APP = `/home/${USER}/domains/kayan-uniform.com/app`;
const SITE = 'https://kayan-uniform.com';

const KEY = process.env.KAYAN_SSH_KEY;
if (!KEY || !existsSync(KEY)) {
  console.error(
    'اضبط KAYAN_SSH_KEY على مسار المفتاح الخاص.\n' +
      'المفتاح لا يُخزَّن في المستودع ولا يُكتب في أي ملف هنا.',
  );
  process.exit(1);
}
const KNOWN = process.env.KAYAN_SSH_KNOWN_HOSTS ?? path.join(path.dirname(KEY), 'known_hosts');

const SSH_ARGS = [
  '-i', KEY,
  '-o', `UserKnownHostsFile=${KNOWN}`,
  '-o', 'IdentitiesOnly=yes',
  '-o', 'BatchMode=yes',
];

// npm على ويندوز ملف .cmd لا ملف تنفيذي، وexecFileSync لا يشغّله بلا صدفة.
const exe = (cmd) => (process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd);

const run = (cmd, args, opts = {}) =>
  execFileSync(exe(cmd), args, {
    stdio: 'pipe',
    encoding: 'utf8',
    shell: process.platform === 'win32' && cmd === 'npm',
    ...opts,
  });

const ssh = (script) =>
  run('ssh', [...SSH_ARGS, '-p', PORT, `${USER}@${HOST}`, 'bash -s'], { input: script });

const step = (msg) => console.log(`\n▸ ${msg}`);

const withDeps = process.argv.includes('--deps');

// ── 0. البوّابات قبل أي شيء يلمس الخادم ─────────────────────
//
// تُشغَّل على المستودع لا على الحزمة المُجهَّزة: الحزمة نسخة، والخطأ يجب أن
// يُمسك في المصدر حيث يُصلَح.
step('lint');
run('npm', ['run', 'lint'], { cwd: ROOT });
console.log('  نظيف');

step('typecheck');
run('npm', ['run', 'typecheck'], { cwd: ROOT });
console.log('  نظيف');

if (!process.argv.includes('--skip-tests')) {
  step('الاختبارات');
  // مجموعات التحقّق تحتاج قاعدة بيانات. غيابها يوقف النشر بدل أن يمرّ
  // بصمت — نشرٌ بلا اختبار ليس نشراً مُتحقَّقاً منه.
  const suites = [
    'verify-rls', 'verify-login', 'verify-decimal', 'verify-phase14',
    'verify-print', 'verify-dashboard', 'verify-reports',
  ];
  for (const s of suites) {
    const out = run('node', [
      '--experimental-strip-types', '--env-file=.env', `scripts/${s}.mjs`,
    ], { cwd: ROOT });
    const last = out.trim().split('\n').pop();
    console.log(`  ${s.padEnd(18)} ${last}`);
  }
}

// ── 1. البناء محلياً ────────────────────────────────────────
step('تجهيز الحزمة');
run('node', [path.join(ROOT, 'scripts', 'package-hostinger.mjs'), 'platform'], { cwd: ROOT });

const stage = path.join(ROOT, 'dist-hostinger', 'kayan-platform');
step('البناء');
run('npm', ['install', '--no-audit', '--no-fund'], { cwd: stage });
run('npm', ['run', 'build'], {
  cwd: stage,
  env: {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: SITE,
    // LEADS_DIR وNEXT_PUBLIC_ERP_URL يأتيان من .env على الخادم، لا من هنا.
  },
});

// ── 2. تطابق الإصدارات قبل لمس الخادم ───────────────────────
//
// مخرجات .next تتوقّع الحزم التي بُنيت عليها. لو اختلف إصدار على الخادم
// انهار التطبيق وقت التشغيل لا وقت الرفع، وهو أسوأ وقت لاكتشاف ذلك.
step('مطابقة إصدارات الحزم');
const readVersions = `export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH
cd ${APP} && node -e "const p=n=>require(n+'/package.json').version;console.log(JSON.stringify({next:p('next'),react:p('react')}))"`;
const remote = JSON.parse(ssh(readVersions).trim().split('\n').pop());
const local = JSON.parse(
  run('node', [
    '-e',
    "const p=n=>require(n+'/package.json').version;console.log(JSON.stringify({next:p('next'),react:p('react')}))",
  ], { cwd: stage }).trim(),
);
for (const key of Object.keys(local)) {
  if (local[key] !== remote[key]) {
    console.error(
      `\n✗ ${key}: محلياً ${local[key]} وعلى الخادم ${remote[key]}.\n` +
        '  أعِد التشغيل بـ --deps لتحديث حزم الخادم أولاً.',
    );
    process.exit(1);
  }
}
console.log(`  next ${local.next} · react ${local.react} — متطابقة`);

// ── 3. الرفع ────────────────────────────────────────────────
step('ضغط الناتج');
// مسار نسبي عمداً: tar يفسّر "D:/..." كمضيف بعيد ويفشل بـ "Cannot connect to D".
run('tar', ['-czf', '../next.tar.gz', '.next'], { cwd: stage });
const tarball = path.join(ROOT, 'dist-hostinger', 'next.tar.gz');
console.log(`  ${(statSync(tarball).size / 1024 / 1024).toFixed(1)} م.ب`);

if (withDeps) {
  step('تحديث حزم الخادم');
  run('scp', [...SSH_ARGS, '-P', PORT, path.join(stage, 'package.json'), `${USER}@${HOST}:${APP}/package.json`]);
  // NOT --omit=dev. next.config.ts is TypeScript, and Next needs the compiler
  // to read it; without typescript present the app tries to npm-install it
  // during boot, which on a process-capped shared host means the first
  // requests get a 503. Measured, not guessed.
  console.log(ssh(`export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH
cd ${APP} && npm install --no-audit --no-fund 2>&1 | tail -2`));
}

step('الرفع');
run('scp', [...SSH_ARGS, '-P', PORT, tarball, `${USER}@${HOST}:${APP}/next.tar.gz`]);

// ── 4. التبديل وإعادة التشغيل ───────────────────────────────
step('التبديل وإعادة التشغيل');
console.log(
  ssh(`set -e
cd ${APP}
rm -rf .next.new .next.old
mkdir -p .next.new
tar -xzf next.tar.gz -C .next.new --strip-components=1
[ -f .next.new/BUILD_ID ] || { echo "الناتج غير سليم — أُلغي النشر"; exit 1; }
[ -d .next ] && mv .next .next.old
mv .next.new .next
rm -f next.tar.gz
mkdir -p tmp && touch tmp/restart.txt
echo "  البناء: $(cat .next/BUILD_ID)"`),
);

// ── 5. التحقّق ──────────────────────────────────────────────
//
// كل طلب هنا يتجاوز الكاش عمداً.
//
// هوستنجر يضع CDN أمام الموقع، وقد سبق أن أعطاني 200 على كل مسار بينما
// التطبيق نفسه كان يرد 503 — كانت الشبكة تخدم نسخة قديمة محفوظة. فحصٌ لا
// يتجاوز الكاش يقيس الكاش لا النشر.
//
// ولا يكفي رمز 200: يجب أن تطابق بصمة البناء الحيّة ما رُفع قبل قليل،
// وإلا كان النشر قد نجح في مكان لا أحد يراه.
step('التحقّق من الموقع الحيّ');

const deployedBuildId = ssh(`cat ${APP}/.next/BUILD_ID`).trim();
const bust = () => `cb=${Date.now()}${Math.random().toString(36).slice(2)}`;
const fetchFresh = (p, extra = []) =>
  run('curl', [
    '-sS', '--max-time', '45',
    '-H', 'Cache-Control: no-cache',
    '-H', 'Pragma: no-cache',
    ...extra,
    `${SITE}${p}${p.includes('?') ? '&' : '?'}${bust()}`,
  ]);

const paths = ['/', '/contact', '/login', '/sitemap.xml', '/robots.txt'];
let failed = 0;
for (const p of paths) {
  let code = '000';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    code = fetchFresh(p, [
      '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-w', '%{http_code}',
    ]).trim();
    if (code === '200') break;
    run('node', ['-e', 'setTimeout(()=>{}, 5000)']);
  }
  console.log(`  ${code === '200' ? '✓' : '✗'} ${p.padEnd(14)} HTTP ${code}`);
  if (code !== '200') failed += 1;
}

const liveHtml = fetchFresh('/');
if (liveHtml.includes(deployedBuildId)) {
  console.log(`  ✓ البناء الحيّ يطابق المرفوع — ${deployedBuildId}`);
} else {
  console.log(`  ✗ الحيّ لا يطابق المرفوع (${deployedBuildId}) — التوجيه يشير لمكان آخر`);
  failed += 1;
}

if (failed) {
  console.error(`\n✗ ${failed} مساراً فشل. النسخة السابقة ما زالت في .next.old — للتراجع:`);
  console.error(`  ssh … "cd ${APP} && rm -rf .next && mv .next.old .next && touch tmp/restart.txt"`);
  process.exit(1);
}

ssh(`rm -rf ${APP}/.next.old`);
console.log('\n✓ نُشر وتُحقّق منه.');
