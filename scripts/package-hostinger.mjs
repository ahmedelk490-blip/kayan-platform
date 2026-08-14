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
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-hostinger');

/** ما تحويه حزمة النشر. لا شيء يُخمَّن وقت التحزيم. */
const TARGETS = {
  platform: {
    appDir: 'apps/web',
    packages: ['brand', 'domain', 'utils', 'motion', 'ui-market'],
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
    extra: [
      // المنصّة لا شيء بلا مخططها وتاريخ هجراتها.
      { from: 'prisma', to: 'prisma' },
      // مجموعات التحقّق تسافر معها. عزل المستأجرين هو الادّعاء الذي
      // يجب إثباته على الجهاز الذي سيحمل بيانات العملاء فعلاً.
      { from: 'scripts', to: 'scripts', only: /^verify-.*\.mjs$/ },
    ],
  },
};

/** قالب البيئة. القيم تُشرح ولا تُملأ. */
const ENV = {
  platform: `# ── متغيّرات منصّة كيان ─────────────────────────────────
# منصّة واحدة: الطبقة العامة والنظام في تطبيق واحد على نطاق واحد.

NEXT_PUBLIC_SITE_URL=https://kayan-uniform.com

# رقم واتساب بصيغة دولية بلا رموز. بدونه لا يظهر الزر إطلاقاً.
NEXT_PUBLIC_WHATSAPP=

# ── قاعدة البيانات ──────────────────────────────────────
# ⚠ PostgreSQL 17 إجباراً. العزل مبني على Row-Level Security،
#   وهي غير موجودة في MariaDB إطلاقاً.

# اتصال التطبيق. لا يملك BYPASSRLS عمداً.
DATABASE_URL=postgresql://kayan_app:PASSWORD@HOST:5432/kayan_erp?schema=public

# الهجرات والصيانة (مالك المخطط).
DIRECT_DATABASE_URL=postgresql://kayan_owner:PASSWORD@HOST:5432/kayan_erp?schema=public
MAINTENANCE_DATABASE_URL=postgresql://kayan_owner:PASSWORD@HOST:5432/kayan_erp?schema=public

# المصادقة وحدها. يحمل BYPASSRLS لأنه يقرأ الهوية قبل معرفة المستأجر.
# ⚠ ممنوح DML على كل الجداول ويجب تضييقه قبل التشغيل الحقيقي.
AUTH_DATABASE_URL=postgresql://kayan_auth:PASSWORD@HOST:5432/kayan_erp?schema=public

# ── طلبات عروض الأسعار ──────────────────────────────────
# ⚠ خارج مجلد النشر إجباراً. مسار نسبي يتحرّك مع كل نشر فتضيع
#   الطلبات القديمة — رُصد حيّاً على الخادم.
LEADS_DIR=/home/USERNAME/kayan-leads
`,
};

const README = {
  platform: `# نشر منصّة كيان

## منصّة واحدة، نطاق واحد
تطبيق Next واحد يخدم الطبقة العامة والنظام. الطبقتان تفصلهما مجموعتا
مسارات بتخطيطَي جذر منفصلين، فكل واحدة تحمّل نظام تصميمها وحده.
مُتحقَّق منه: --color-brand يساوي #c46481 على / و#5c2535 على /sales.

| العنوان | الطبقة |
|---|---|
| / و /contact و /legal | عامة |
| /login | المصادقة — نقطة الدخول الوحيدة |
| /dashboard /sales /admin /portal | النظام |

## ⚠ المتطلّب الحاكم
**PostgreSQL 17.** الاستضافة المشتركة لا توفّرها — مقيس: المنفذ 5432
مغلق، و/opt/alt/postgresql11 مكتبة عميل PHP لا خادم، والمتاح MariaDB.
وMariaDB لا تملك Row-Level Security، و55 جدولاً هنا تعتمد عليها.
النقل إليها حذف لطبقة العزل لا ترحيل لها. يحتاج VPS.

## الخطوات
1. أنشئ قاعدة kayan_erp والأدوار الثلاثة.
2. انسخ .env.example إلى .env واملأه. لا تترك كلمة مرور نموذجية.
3. npm install — على لينكس، فالملفات الثنائية تُختار هناك.
4. npx prisma migrate deploy — 8 هجرات بما فيها سياسات RLS.
5. npm run build ثم npm start.

## التحقّق بعد النشر
node --experimental-strip-types --env-file=.env scripts/verify-rls.mjs

20 تأكيداً تهاجم العزل بالقراءة عبر المفتاح الأساسي ومحاولة التزوير
وتسرّب الإعدادات بين الاتصالات المجمّعة. يجب أن تمرّ على الخادم الذي
سيحمل بيانات العملاء — إثباتها من جهاز آخر لا يقول شيئاً عنه.

## ⚠ قبل التشغيل الحقيقي
- غيّر كل كلمات المرور. حسابات البذرة كلها بكلمة واحدة معروفة.
- ضيّق دور kayan_auth — يحمل BYPASSRLS مع DML على كل الجداول.
- لا يوجد نسخ احتياطي مجدول.
- لا يوجد CI — 387 تأكيداً تُشغَّل يدوياً.
`,
};

export async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(full) : (await stat(full)).size;
  }
  return total;
}

/**
 * Stage one application into `stage`, self-contained.
 *
 * Exported so the VPS bundle can call it twice — once per app — into two
 * subfolders of a single archive, without either script drifting from the
 * other's idea of what a deployable app contains.
 */
export async function stageApp(target, stage, { includeDocs = true } = {}) {
  const spec = TARGETS[target];
  if (!spec) throw new Error(`unknown target ${target}`);

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

  for (const { from, to, only } of spec.extra ?? []) {
    const source = path.join(ROOT, from);
    await cp(source, path.join(stage, to), {
      recursive: true,
      // `only` keeps directories (cp needs them to recurse) and filters the
      // files, so build tooling does not travel with the deployment.
      filter: (src) =>
        !only || src === source || !src.endsWith('.mjs') || only.test(path.basename(src)),
    });
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

  // The host runs npm itself, then the start script. Each app is given its
  // port explicitly so two of them can share one machine behind a proxy.
  pkg.scripts = {
    build: pkg.scripts.build,
    start: `next start --port ${target === 'erp' ? 3300 : 3200}`,
    ...(target === 'erp' ? { postinstall: 'prisma generate' } : {}),
  };
  pkg.name = `kayan-${target}`;
  pkg.private = true;
  // Next 15 and React 19 want Node 20 as a floor.
  pkg.engines = { node: '>=20.0.0' };

  // devDependencies travel because the server BUILDS: the build needs
  // typescript, tailwind and the eslint config, so pruning them here would
  // break the very step this bundle exists for.
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  await writeFile(path.join(stage, '.env.example'), ENV[target]);
  if (includeDocs) {
    // ASCII filename on purpose: an Arabic name inside a ZIP bound for a
    // Linux server survives only if every tool honours the UTF-8 flag, and
    // the round-trip test showed one that does not. The CONTENT stays Arabic.
    await writeFile(path.join(stage, 'README-DEPLOY.md'), README[target]);
  }

  return { packages: spec.packages.length, bytes: await dirSize(stage) };
}

// Run directly (not imported) → stage a single app, as before.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!TARGETS[target]) {
    console.error(`Usage: package-hostinger.mjs <${Object.keys(TARGETS).join('|')}>`);
    process.exit(1);
  }
  const stage = path.join(OUT, `kayan-${target}`);
  stageApp(target, stage)
    .then(({ packages, bytes }) => {
      console.log(`staged ${path.relative(ROOT, stage)}`);
      console.log(`  ${packages} workspace packages vendored as file: deps`);
      console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB before compression`);
      console.log('  node_modules deliberately excluded — the server installs on Linux');
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
