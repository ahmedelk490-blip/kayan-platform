/**
 * Build ONE deployment archive holding both applications.
 *
 * Why one archive but still two applications, rather than one fused Next.js
 * app: the two carry conflicting design systems. Both define `--color-brand`
 * — among 23 tokens on the site and 59 in the ERP — with different values.
 * Fusing them into a single app puts both stylesheets in one bundle and lets
 * a cinematic marketing token overwrite a dense operational one, or the
 * reverse, depending on import order. That is precisely the failure the
 * project rule "never mix the two UX philosophies" exists to prevent, and it
 * would surface as a subtly wrong colour on an invoice rather than as a build
 * error.
 *
 * So they stay two Node processes on one machine, behind one nginx that owns
 * the domain. To the visitor it is one system: kayan-uniform.com is the site,
 * erp.kayan-uniform.com is the ERP, and the login button crosses between them
 * without leaving the base domain. To the codebase they remain what every
 * earlier phase built and tagged.
 *
 *   node scripts/package-vps.mjs
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageApp, dirSize } from './package-hostinger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-hostinger');
const STAGE = path.join(OUT, 'kayan-uniform-vps');

const DOMAIN = 'kayan-uniform.com';
const ERP_HOST = `erp.${DOMAIN}`;

// ── nginx ───────────────────────────────────────────────────
//
// Two server blocks, one certificate request covering both names. The ERP
// block adds no basePath rewriting: the app is served at the root of its own
// hostname, so not one line of application code changes to run here.
const NGINX = `# /etc/nginx/sites-available/kayan
#
# الموقع التسويقي على النطاق الأساسي، والنظام على نطاق فرعي منه.
# كلاهما على نفس الخادم، والزر ينقل بينهما دون مغادرة النطاق الأساسي.

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN} ${ERP_HOST};

    # certbot يستبدل هذا بتحويل إلى HTTPS عند إصدار الشهادة.
    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name ${ERP_HOST};

    # حدّ حجم الطلب: النظام يستقبل مرفقات، لا ملفات ضخمة.
    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # سجلّ التدقيق يقرأ هذا الترويسة لتسجيل عنوان المستخدم.
        # بدونها كل سطر في السجل سيقول 127.0.0.1.
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;

// The marketing block above deliberately lists the ERP host too, because
// nginx matches the MOST specific server_name — the dedicated ERP block wins
// for that hostname. Listing it in both is what makes a single certbot run
// cover all three names.

const SYSTEMD_SITE = `[Unit]
Description=KAYAN marketing site (Next.js)
After=network.target

[Service]
Type=simple
User=kayan
WorkingDirectory=/srv/kayan/site
EnvironmentFile=/srv/kayan/site/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

const SYSTEMD_ERP = `[Unit]
Description=KAYAN ERP (Next.js)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=kayan
WorkingDirectory=/srv/kayan/erp
EnvironmentFile=/srv/kayan/erp/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

const INSTALL = `#!/usr/bin/env bash
#
# تثبيت كيان على VPS نظيف (Ubuntu 22.04 أو 24.04).
#
# لا يضبط كلمات مرور ولا يخترع قيماً: يتوقف ويطلب منك ما لا يعرفه.
# شغّله بعد فكّ الأرشيف داخل /srv/kayan.

set -euo pipefail

BASE=/srv/kayan
DOMAIN=${DOMAIN}
ERP_HOST=${ERP_HOST}

log() { printf '\\n\\033[1;35m▸ %s\\033[0m\\n' "$1"; }
die() { printf '\\n\\033[1;31m✗ %s\\033[0m\\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "شغّل السكربت بصلاحيات root."

# ── تحقق قبل أي تغيير ───────────────────────────────────────
for d in site erp; do
  [ -d "$BASE/$d" ] || die "المجلد $BASE/$d غير موجود. فُكّ الأرشيف داخل $BASE أولاً."
done

if [ ! -f "$BASE/erp/.env" ]; then
  die "أنشئ $BASE/erp/.env من .env.example أولاً — لن أخترع بيانات اتصال قاعدة البيانات."
fi
if [ ! -f "$BASE/site/.env" ]; then
  die "أنشئ $BASE/site/.env من .env.example أولاً."
fi

log "تثبيت المتطلبات"
apt-get update -qq
apt-get install -y curl ca-certificates gnupg nginx postgresql postgresql-contrib

if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  log "تثبيت Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

id kayan >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin kayan
chown -R kayan:kayan "$BASE"

# ── قاعدة البيانات ──────────────────────────────────────────
log "تجهيز قاعدة البيانات"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='kayan_erp'" | grep -q 1 \\
  || sudo -u postgres createdb kayan_erp
echo "  ⚠ الأدوار وكلمات المرور تُنشأ يدوياً — راجع README-DEPLOY.md قسم قاعدة البيانات."

# ── البناء ──────────────────────────────────────────────────
for app in site erp; do
  log "بناء $app"
  cd "$BASE/$app"
  sudo -u kayan npm install --no-audit --no-fund
  sudo -u kayan npm run build
done

log "تطبيق الهجرات"
cd "$BASE/erp"
sudo -u kayan npx prisma migrate deploy

# ── الخدمات ─────────────────────────────────────────────────
log "تسجيل الخدمات"
cp "$BASE/deploy/kayan-site.service" /etc/systemd/system/
cp "$BASE/deploy/kayan-erp.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kayan-site kayan-erp

log "ضبط nginx"
cp "$BASE/deploy/nginx-kayan.conf" /etc/nginx/sites-available/kayan
ln -sf /etc/nginx/sites-available/kayan /etc/nginx/sites-enabled/kayan
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "تم"
cat <<EOF

  الموقع  →  http://$DOMAIN
  النظام  →  http://$ERP_HOST

  الخطوة الأخيرة، شهادة HTTPS لكلا النطاقين:

    certbot --nginx -d $DOMAIN -d www.$DOMAIN -d $ERP_HOST

  بعدها اضبط في $BASE/site/.env:
    NEXT_PUBLIC_ERP_URL=https://$ERP_HOST/login
  ثم: systemctl restart kayan-site

  ⚠ لم تُنشأ حسابات بعد. شغّل البذرة يدوياً بعد مراجعة كلمات المرور:
    cd $BASE/erp && sudo -u kayan node --experimental-strip-types prisma/seed.mjs

EOF
`;

const README = `# نشر كيان على VPS — ملف واحد، نطاق واحد

## ما بالداخل
\`\`\`
site/     الموقع التسويقي      → المنفذ 3200
erp/      نظام ERP             → المنفذ 3300
deploy/   nginx + systemd + install.sh
\`\`\`

## لماذا تطبيقان داخل ملف واحد وليس تطبيقاً مدمجاً
التطبيقان يحملان نظامَي تصميم متعارضين: كلاهما يعرّف \`--color-brand\`
بقيمتين مختلفتين — 23 رمزاً في الموقع و59 في النظام. دمجهما في تطبيق
Next واحد يضع ملفَّي الأنماط في حزمة واحدة، فيطغى رمز من الموقع السينمائي
على رمز تشغيلي في النظام حسب ترتيب الاستيراد. هذا بالضبط ما تحرسه قاعدة
"لا تخلط فلسفتَي الواجهة"، وسيظهر كلون خاطئ على فاتورة لا كخطأ في البناء.

فبقيا عمليتين على خادم واحد خلف nginx واحد يملك النطاق. **بالنسبة للزائر
نظام واحد:** الموقع على النطاق الأساسي، والنظام على نطاق فرعي منه، وزر
الدخول ينقل بينهما دون مغادرة \`${DOMAIN}\`. وبالنسبة للكود يبقى كل تطبيق
كما بُني ووُسم في المراحل السابقة، دون تعديل سطر واحد.

## الخطوات
1. أنشئ VPS بـ Ubuntu 22.04 أو 24.04.
2. وجّه سجلَّي A إلى عنوان الخادم:
   - \`${DOMAIN}\` و \`www\`
   - \`erp\`
3. ارفع الأرشيف وفُكّه:
   \`\`\`bash
   mkdir -p /srv/kayan && unzip kayan-uniform-vps.zip -d /srv/kayan
   \`\`\`
4. **أنشئ ملفَّي البيئة قبل التشغيل** — السكربت يتوقف بدونهما عمداً:
   \`\`\`bash
   cp /srv/kayan/site/.env.example /srv/kayan/site/.env
   cp /srv/kayan/erp/.env.example  /srv/kayan/erp/.env
   \`\`\`
   ثم حرّرهما. لا تترك أي كلمة مرور نموذجية.
5. \`bash /srv/kayan/deploy/install.sh\`
6. شهادة HTTPS لكلا النطاقين:
   \`\`\`bash
   certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} -d ${ERP_HOST}
   \`\`\`
7. بعد نجاح الشهادة، اضبط \`NEXT_PUBLIC_ERP_URL\` في \`site/.env\` ثم
   \`systemctl restart kayan-site\`. **قبل هذه الخطوة يعرض الموقع
   "قيد التجهيز" بدل زر دخول لا يعمل** — وهذا مقصود.

## ⚠ البناء يحتاج إنترنت على الخادم
كلا التطبيقين يستخدم \`next/font/google\`، وهذا **ينزّل الخطوط أثناء البناء**
لا أثناء التشغيل. حدث معي فعلاً أن فشل بناء النظام لهذا السبب ثم نجح عند
الإعادة. إن كان الخادم خلف جدار ناري يمنع \`fonts.googleapis.com\` فسيفشل
\`npm run build\` برسالة \`next/font error\` مبهمة.

الحل عند الفشل: أعِد المحاولة، أو افتح المنفذ للنطاق أثناء البناء فقط.

## قاعدة البيانات — الأدوار الثلاثة
السكربت ينشئ القاعدة ولا ينشئ الأدوار: كلمات المرور قرارك وحدك.

\`\`\`sql
CREATE ROLE kayan_app  LOGIN PASSWORD '...';
CREATE ROLE kayan_auth LOGIN PASSWORD '...' BYPASSRLS;
GRANT CONNECT ON DATABASE kayan_erp TO kayan_app, kayan_auth;
\`\`\`

\`kayan_app\` **لا يحمل** \`BYPASSRLS\` — هذا هو ما يجعل عزل المستأجرين
حقيقياً لا اتفاقاً على مستوى الكود. الهجرات تنشئ 55 سياسة \`FORCE\`.

⚠ \`kayan_auth\` ممنوح حالياً DML على كل الجداول، والمفترض أن يقتصر على
جداول الهوية. مخاطرة قائمة ومسجّلة منذ المرحلة 7.

## التحقق بعد النشر
\`\`\`bash
cd /srv/kayan/erp
sudo -u kayan node --experimental-strip-types --env-file=.env scripts/verify-rls.mjs
\`\`\`
هذا الفحص يهاجم العزل بالقراءة عبر المفتاح الأساسي ومحاولة التزوير
وتسرّب الإعدادات بين الاتصالات المجمّعة. 20 تأكيداً يجب أن تمرّ كلها.

## ⚠ قبل التشغيل الحقيقي
- **غيّر كل كلمات المرور.** حسابات البذرة كلها بكلمة واحدة معروفة.
- **لا يوجد نسخ احتياطي مجدول.** لا شيء يحمي البيانات اليوم.
- **لا يوجد CI.** الـ387 تأكيداً تُشغَّل يدوياً.
- **طلبات عروض الأسعار** تُحفظ في \`site/.leads/leads.jsonl\` غير مشفّر.
  حلّ مؤقت منذ المرحلة 3 — يحتاج توصيلاً بالـ CRM أو إشعاراً بريدياً قبل
  استقبال طلبات حقيقية.
`;

async function main() {
  await rm(STAGE, { recursive: true, force: true });
  await mkdir(STAGE, { recursive: true });

  // Both apps staged by the SAME function the single-app bundles use, so the
  // two paths cannot drift apart on what a deployable app contains.
  const site = await stageApp('marketing', path.join(STAGE, 'site'), { includeDocs: false });
  const erp = await stageApp('erp', path.join(STAGE, 'erp'), { includeDocs: false });

  const deploy = path.join(STAGE, 'deploy');
  await mkdir(deploy, { recursive: true });
  await writeFile(path.join(deploy, 'nginx-kayan.conf'), NGINX);
  await writeFile(path.join(deploy, 'kayan-site.service'), SYSTEMD_SITE);
  await writeFile(path.join(deploy, 'kayan-erp.service'), SYSTEMD_ERP);
  // LF endings and a trailing newline: a CRLF shebang line is not executable
  // on Linux, and this file is written from Windows.
  await writeFile(path.join(deploy, 'install.sh'), INSTALL.replace(/\r\n/g, '\n'));
  await writeFile(path.join(STAGE, 'README-DEPLOY.md'), README);

  const bytes = await dirSize(STAGE);
  console.log(`staged ${path.relative(ROOT, STAGE)}`);
  console.log(`  site/ — ${site.packages} packages, ${(site.bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  erp/  — ${erp.packages} packages, ${(erp.bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB before compression`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
