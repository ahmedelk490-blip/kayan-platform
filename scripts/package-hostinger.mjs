/**
 * Build a Hostinger-ready deployment bundle.
 *
 * The awkward part is that this is a monorepo and Hostinger is not. The apps
 * depend on workspace packages declared as `"@erp/brand": "*"`, which resolves
 * only because npm workspaces links them. Uploaded on its own, `npm install`
 * would look for a package called @erp/brand on the public registry, not find
 * it, and fail — so every workspace dependency is copied in and its version
 * rewritten to a `file:` path that npm can actually resolve.
 *
 * node_modules is deliberately NOT bundled. Three of the dependencies ship
 * platform-specific native binaries — @node-rs/argon2, sharp and Next's own
 * SWC — and this machine is Windows while Hostinger is Linux. Shipping the
 * Windows binaries would produce an app that installs cleanly and then throws
 * at the first password hash. Hostinger runs npm itself on deploy, on Linux,
 * which is the only place the right binaries can be chosen.
 *
 *   node --experimental-strip-types scripts/package-hostinger.mjs marketing
 *   node --experimental-strip-types scripts/package-hostinger.mjs erp
 */
import { cp, mkdir, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-hostinger');

/** What each bundle contains. Nothing is guessed at pack time. */
const TARGETS = {
  marketing: {
    appDir: 'apps/marketing',
    packages: ['brand', 'motion', 'ui-market', 'utils'],
    files: [
      'src',
      'public',
      'next.config.ts',
      'postcss.config.mjs',
      'tsconfig.json',
      'next-env.d.ts',
      'package.json',
    ],
    // Files that must NOT travel: the interim lead store holds real
    // submissions, and shipping it back up would republish them.
    exclude: ['.leads'],
  },
  erp: {
    appDir: 'apps/web',
    packages: ['brand', 'domain', 'utils'],
    files: [
      'src',
      'public',
      'next.config.ts',
      'postcss.config.mjs',
      'tsconfig.json',
      'next-env.d.ts',
      'package.json',
    ],
    exclude: [],
    // The ERP is nothing without its schema and migration history.
    extra: [{ from: 'prisma', to: 'prisma' }],
  },
};

/** Environment templates. Values are never filled in — only explained. */
const ENV = {
  marketing: `# ── متغيّرات البيئة للموقع التسويقي ──────────────────────
# اضبطها من hPanel: Websites → Node.js → Environment Variables
# لا ترفع هذا الملف بقيم حقيقية إلى أي مستودع.

# عنوان الموقع الكامل. يُستخدم لتحويل صورة المشاركة الاجتماعية
# إلى رابط مطلق. بدونه ستشير روابط المشاركة إلى localhost.
NEXT_PUBLIC_SITE_URL=https://example.com

# رابط صفحة دخول نظام ERP. زر "دخول الموظفين" يشير إليه.
# اتركه فارغاً إن لم يُنشر النظام بعد — وعندها احذف الزر من الصفحة
# بدلاً من تركه يشير إلى عنوان لا يعمل.
NEXT_PUBLIC_ERP_URL=https://erp.example.com/login
`,
  erp: `# ── متغيّرات البيئة لنظام ERP ───────────────────────────
# ⚠ هذا النظام يتطلب PostgreSQL 17. لا يعمل على MySQL:
#   عزل المستأجرين مبني على Row-Level Security، وهي غير موجودة
#   في MySQL أصلاً. استضافة Business/Cloud لا توفّر PostgreSQL.

# اتصال التطبيق. هذا المستخدم لا يملك BYPASSRLS عمداً.
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/kayan_erp?schema=public

# اتصال الهجرات والصيانة (مالك المخطط).
DIRECT_DATABASE_URL=postgresql://OWNER:PASSWORD@HOST:5432/kayan_erp?schema=public
MAINTENANCE_DATABASE_URL=postgresql://OWNER:PASSWORD@HOST:5432/kayan_erp?schema=public

# اتصال المصادقة وحده. هذا المستخدم يحمل BYPASSRLS لأنه يقرأ
# جداول الهوية قبل معرفة المستأجر.
# ⚠ مخاطرة قائمة: هذا الدور ممنوح DML على كل الجداول ويجب تضييقه
#   إلى جداول الهوية فقط قبل التشغيل الحقيقي.
AUTH_DATABASE_URL=postgresql://kayan_auth:PASSWORD@HOST:5432/kayan_erp?schema=public
`,
};

const README = {
  marketing: `# نشر الموقع التسويقي على هوستنجر

## قبل الرفع
خطة **Business** أو **Cloud**. الخطط المشتركة (Premium / Single) لا تدعم
Node.js، والموقع يحتاجه: نموذج طلب عرض السعر مسار خادم حقيقي
(\`/api/leads\`)، ولو صُدِّر الموقع كملفات ثابتة سيتوقف النموذج عن العمل —
وهو مسار التحويل الوحيد في الموقع.

## الخطوات
1. hPanel → **Websites** → اختر النطاق → **Node.js**.
2. اضغط **Create application**، واختر إصدار Node **20** أو أحدث.
3. ارفع \`kayan-marketing.zip\` عبر خيار رفع ملف مضغوط.
4. من **Environment Variables** أضِف المتغيّرات الموجودة في \`.env.example\`.
5. هوستنجر يشغّل \`npm install\` ثم \`npm run build\` تلقائياً، ثم \`npm start\`.

## لماذا لا يحتوي الملف على node_modules
ثلاث حزم تحتوي ملفات ثنائية خاصة بنظام التشغيل — \`sharp\` ومحرّك SWC
الخاص بـ Next. هذا الملف بُني على Windows والخادم يعمل بـ Linux. لو
رُفعت ملفات Windows لثبّت التطبيق بنجاح ثم انهار عند أول طلب صورة.
هوستنجر يشغّل npm على Linux، وهو المكان الوحيد الذي تُختار فيه
الملفات الصحيحة.

## تم التحقق منه
ثُبِّتت هذه الحزمة وبُنِيت فعلاً خارج المونوريبو قبل التسليم: \`npm install\`
ثم \`npm run build\` نجحا، و9 صفحات تولّدت بما فيها \`/api/leads\`.

## ⚠ نقطة تحتاج قراراً قبل استقبال طلبات حقيقية
طلبات عروض الأسعار تُحفظ في ملف \`.leads/leads.jsonl\` **غير مشفّر** داخل
مجلد التطبيق. هذا حلّ مؤقت موثّق منذ المرحلة 3، وليس مسار الإنتاج: كان
المفترض أن تدخل الطلبات إلى CRM في النظام. قبل الإعلان عن الموقع، إمّا
توصيله بالنظام أو إضافة إشعار بريدي — وإلا فقد يمرّ طلب عميل دون أن
يراه أحد.
`,
  erp: `# نشر نظام ERP

## ⚠ اقرأ هذا أولاً — النظام لا يعمل على خطة Business أو Cloud

النظام يتطلب **PostgreSQL 17**، وهوستنجر لا توفّر PostgreSQL على خطط
الاستضافة المشتركة والسحابية — على **VPS فقط**. المتاح على Business
و Cloud هو MySQL.

وهذا ليس اختلاف نكهة قواعد بيانات يمكن تجاوزه بتغيير الموصّل:

- **عزل المستأجرين مبني بالكامل على Row-Level Security**، وهي ميزة
  غير موجودة في MySQL إطلاقاً. 55 جدولاً عليها سياسات \`FORCE\` تعتمد
  على \`app.tenant_id\`، وهناك 20 تأكيداً تُثبت العزل بالهجوم عليه.
  النقل إلى MySQL يعني حذف هذه الطبقة، لا ترحيلها.
- ثلاثة أدوار قاعدة بيانات منفصلة، أحدها \`BYPASSRLS\`.
- أعمدة \`NUMERIC(19,4)\` للمبالغ والكميات.

## المسارات المتاحة
1. **Hostinger VPS** — تثبيت PostgreSQL 17 عليه. النظام يعمل كما بُني
   دون أي تعديل. هذا الخيار الموصى به.
2. **تطبيق Node على Business + قاعدة PostgreSQL مُدارة خارجية**
   (Neon أو Supabase أو Railway). قد ينجح، لكنه **غير مُتحقَّق منه**:
   يعتمد على سماح الاستضافة المشتركة باتصال صادر على المنفذ 5432،
   ولا أستطيع التأكد من ذلك دون تجربته على حسابك.

## بعد توفير PostgreSQL
1. أنشئ قاعدة \`kayan_erp\` والأدوار الثلاثة.
2. اضبط المتغيّرات من \`.env.example\`.
3. \`npx prisma migrate deploy\` — يطبّق 8 هجرات بما فيها سياسات RLS.
4. \`node --experimental-strip-types prisma/seed.mjs\` للأدوار والصلاحيات.
5. \`npm run build\` ثم \`npm start\`.

## ⚠ قبل أي تشغيل حقيقي
- **غيّر كلمات المرور.** ملف \`.env\` في التطوير يحمل كلمات ظاهرة،
  وحسابات البذرة كلها بكلمة واحدة معروفة.
- **ضيّق دور \`kayan_auth\`** — يحمل \`BYPASSRLS\` مع صلاحيات DML على كل
  الجداول، والمفترض أن يقتصر على جداول الهوية.
- **لا يوجد نسخ احتياطي مجدول.** لا شيء يحمي البيانات اليوم.
- **لا يوجد CI.** الـ387 تأكيداً تُشغَّل يدوياً.
`,
};

const target = process.argv[2];
if (!TARGETS[target]) {
  console.error(`Usage: package-hostinger.mjs <${Object.keys(TARGETS).join('|')}>`);
  process.exit(1);
}
const spec = TARGETS[target];
const stage = path.join(OUT, `kayan-${target}`);

async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(full) : (await stat(full)).size;
  }
  return total;
}

async function main() {
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });

  const appRoot = path.join(ROOT, spec.appDir);

  // ── The application itself ────────────────────────────────
  for (const file of spec.files) {
    const from = path.join(appRoot, file);
    if (!existsSync(from)) {
      throw new Error(`missing ${spec.appDir}/${file} — refusing to ship an incomplete bundle`);
    }
    await cp(from, path.join(stage, file), {
      recursive: true,
      filter: (src) => !spec.exclude.some((ex) => src.includes(`${path.sep}${ex}`)),
    });
  }

  for (const { from, to } of spec.extra ?? []) {
    await cp(path.join(ROOT, from), path.join(stage, to), { recursive: true });
  }

  // ── Workspace packages, flattened ─────────────────────────
  //
  // Copied whole, source and all: these ship TypeScript rather than build
  // output, and the app's next.config lists them in transpilePackages.
  const vendored = path.join(stage, 'packages');
  await mkdir(vendored, { recursive: true });

  for (const name of spec.packages) {
    const from = path.join(ROOT, 'packages', name);
    if (!existsSync(from)) throw new Error(`missing packages/${name}`);
    await cp(from, path.join(vendored, name), {
      recursive: true,
      filter: (src) =>
        !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.turbo`),
    });

    // A vendored package may itself depend on another one.
    const manifestPath = path.join(vendored, name, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.dependencies) {
      for (const dep of Object.keys(manifest.dependencies)) {
        if (dep.startsWith('@erp/')) {
          manifest.dependencies[dep] = `file:../${dep.replace('@erp/', '')}`;
        }
      }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  // ── Rewrite the app manifest ──────────────────────────────
  const pkgPath = path.join(stage, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));

  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (dep.startsWith('@erp/')) {
      pkg.dependencies[dep] = `file:./packages/${dep.replace('@erp/', '')}`;
    }
  }

  // Hostinger runs npm itself, then the start script. `next start` needs the
  // port it is given rather than the one this repo uses in development.
  pkg.scripts = {
    build: pkg.scripts.build,
    start: 'next start',
    ...(target === 'erp' ? { postinstall: 'prisma generate' } : {}),
  };
  pkg.name = `kayan-${target}`;
  pkg.private = true;
  // Hostinger offers 18/20/22/24. Next 15 and React 19 want 20 as a floor.
  pkg.engines = { node: '>=20.0.0' };

  // devDependencies travel because Hostinger BUILDS on the server: the build
  // needs typescript, tailwind and the eslint config, so pruning them here
  // would break the very step this bundle exists for.
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // ── Deployment notes and the environment template ─────────
  await writeFile(path.join(stage, '.env.example'), ENV[target]);
  // ASCII filename on purpose: an Arabic name inside a ZIP bound for a
  // Linux server survives only if every tool honours the UTF-8 flag, and the
  // round-trip test showed one that does not. The CONTENT stays Arabic.
  await writeFile(path.join(stage, 'README-DEPLOY.md'), README[target]);

  const bytes = await dirSize(stage);
  console.log(`staged ${path.relative(ROOT, stage)}`);
  console.log(`  ${spec.packages.length} workspace packages vendored as file: deps`);
  console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB before compression`);
  console.log('  node_modules deliberately excluded — Hostinger installs on Linux');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
