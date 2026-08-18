/**
 * تهيئة قاعدة بيانات جديدة لمنصّة كيان.
 *
 *   node --env-file=.env scripts/bootstrap-database.mjs "postgresql://..."
 *
 * يأخذ رابط اتصال واحداً بصلاحية المالك، ويخرج بثلاثة روابط جاهزة للنسخ في
 * متغيّرات البيئة. بينهما: إنشاء الأدوار، الهجرات الاثنتا عشرة، ثم فحص أن
 * العزل يمنع فعلاً.
 *
 * ── لماذا يلزم هذا أصلاً ───────────────────────────────────
 *
 * هجرات RLS تمنح صلاحيات لثلاثة أدوار تفترض وجودها. على قاعدة جديدة تفشل
 * أول هجرة بـ«role kayan_app does not exist»، ويبدو الخطأ كعطل في الاستضافة
 * وليس كذلك. فتُنشأ الأدوار أولاً.
 *
 * ── لماذا يُقاس التجاوز ولا يُفترض ─────────────────────────
 *
 * الخاصية الأمنية كلها في جملة واحدة: اتصال التطبيق **لا يستطيع** تجاوز
 * العزل. على PostgreSQL عادي يُضبط ذلك بـ NOBYPASSRLS. وعلى خدمة مُدارة
 * كـNeon لا وجود لمستخدم فائق أصلاً، والأدوار المُنشأة بـSQL تولد بلا
 * تجاوز — وهو المطلوب، لكن بالصدفة لا بالقصد.
 *
 * فلا يُصدَّق أيّهما. السكربت يكتب صفّاً لمستأجر، ثم يقرأه باتصال التطبيق
 * تحت هوية مستأجر آخر، ويُفشل التهيئة إن ظهر. عزلٌ غير مُختبَر ليس عزلاً.
 *
 * آمن لإعادة التشغيل: الأدوار تُنشأ إن غابت، والهجرات تتخطّى المطبَّق.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const ownerUrl = process.argv[2] ?? process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) {
  console.error('الاستعمال: node --env-file=.env scripts/bootstrap-database.mjs "postgresql://..."');
  process.exit(1);
}

/** كلمة مرور بلا محارف تحتاج ترميزاً داخل رابط الاتصال. */
const password = () => randomBytes(24).toString('base64url');

/** رابط جديد بنفس المضيف والقاعدة، بمستخدم آخر. */
function withUser(url, user, pass) {
  const u = new URL(url);
  u.username = user;
  u.password = pass;
  return u.toString();
}

const db = new PrismaClient({ datasources: { db: { url: ownerUrl } }, log: ['error'] });
const say = (m) => console.log(m);

async function main() {
  const [{ current_user: owner, version }] = await db.$queryRaw`
    SELECT current_user, version()`;
  say(`المالك: ${owner}`);
  say(`${String(version).split(',')[0]}\n`);

  // هل نحن على PostgreSQL نملك فيه مستخدماً فائقاً، أم على خدمة مُدارة؟
  // الفرق يحدّد من يحمل اتصال الهوية.
  const [{ rolsuper: isSuper }] = await db.$queryRaw`
    SELECT rolsuper FROM pg_roles WHERE rolname = current_user`;
  const [{ bypass: ownerBypasses }] = await db.$queryRaw`
    SELECT bool_or(rolbypassrls) AS bypass FROM pg_roles
    WHERE rolname = current_user
       OR oid IN (SELECT roleid FROM pg_auth_members
                  WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user))`;

  say(isSuper ? 'مستخدم فائق — الأدوار الثلاثة تُنشأ كاملة' : 'خدمة مُدارة — بلا مستخدم فائق');
  say(`المالك يتجاوز العزل: ${ownerBypasses ? 'نعم' : 'لا'}\n`);

  // ── الأدوار ────────────────────────────────────────────
  const appPass = password();

  // اتصال التطبيق. لا يملك شيئاً ولا يتجاوز العزل — وهذا كل الغرض منه.
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kayan_app') THEN
        CREATE ROLE kayan_app LOGIN PASSWORD '${appPass}';
      ELSE
        ALTER ROLE kayan_app WITH LOGIN PASSWORD '${appPass}';
      END IF;
    END $$;`);
  say('✓ kayan_app — اتصال التطبيق');

  // على PostgreSQL نملكه: NOBYPASSRLS صراحةً. على المُدار: تعذّر التعديل
  // ليس فشلاً، لأن الدور وُلد بلا تجاوز أصلاً — والفحص أدناه يحسم.
  try {
    await db.$executeRawUnsafe('ALTER ROLE kayan_app NOBYPASSRLS');
    say('  NOBYPASSRLS مضبوطة صراحةً');
  } catch {
    say('  تعذّر ضبط NOBYPASSRLS (خدمة مُدارة) — سيُقاس بالفحص');
  }

  let authUser = owner;
  let authPass = null;
  if (isSuper) {
    authPass = password();
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kayan_auth') THEN
          CREATE ROLE kayan_auth LOGIN BYPASSRLS PASSWORD '${authPass}';
        ELSE
          ALTER ROLE kayan_auth WITH LOGIN BYPASSRLS PASSWORD '${authPass}';
        END IF;
      END $$;`);
    authUser = 'kayan_auth';
    say('✓ kayan_auth — البحث عن المستخدم قبل معرفة مستأجره');
  } else if (ownerBypasses) {
    say('✓ اتصال الهوية = المالك (يتجاوز العزل، وهو ما يحتاجه تسجيل الدخول)');
  } else {
    console.error('\n✗ لا دور يتجاوز العزل. تسجيل الدخول يبحث عن المستخدم قبل');
    console.error('  معرفة مستأجره، فيلزمه ذلك. أنشئ الدور من لوحة الخدمة.');
    process.exit(1);
  }

  // kayan_owner اسم تستعمله الهجرات في GRANT. على المُدار يُصنع كدور بلا
  // دخول ويُمنح للمالك، فتمرّ الهجرات بلا أن يحمل أحد صلاحيات زائدة.
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kayan_owner') THEN
        CREATE ROLE kayan_owner NOLOGIN;
      END IF;
    END $$;`);
  await db.$executeRawUnsafe(`GRANT kayan_owner TO ${owner}`).catch(() => {});
  if (!isSuper) {
    await db.$executeRawUnsafe(`GRANT kayan_auth TO ${owner}`).catch(() => {});
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kayan_auth') THEN
          CREATE ROLE kayan_auth NOLOGIN;
        END IF;
      END $$;`);
  }
  say('✓ kayan_owner\n');

  const urls = {
    DATABASE_URL: withUser(ownerUrl, 'kayan_app', appPass),
    DIRECT_DATABASE_URL: ownerUrl,
    AUTH_DATABASE_URL: authPass ? withUser(ownerUrl, authUser, authPass) : ownerUrl,
  };

  // ── الهجرات ────────────────────────────────────────────
  say('تشغيل الهجرات…');
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: ownerUrl, DIRECT_DATABASE_URL: ownerUrl },
  });

  const [{ n: tables }] = await db.$queryRaw`
    SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`;
  const [{ n: secured }] = await db.$queryRaw`
    SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND rowsecurity`;
  say(`\n✓ ${tables} جدولاً · ${secured} عليه عزل\n`);

  // ── العزل: يُقاس، لا يُفترض ────────────────────────────
  //
  // مستأجران وصفّ لكلٍّ منهما، ثم يُقرآن باتصال التطبيق تحت هوية أحدهما.
  // إن ظهر صفّ الآخر فالعزل معطّل، ولا فائدة من بقية التهيئة.
  say('فحص العزل…');
  const A = `probe-a-${randomBytes(4).toString('hex')}`;
  const B = `probe-b-${randomBytes(4).toString('hex')}`;
  const app = new PrismaClient({ datasources: { db: { url: urls.DATABASE_URL } }, log: [] });

  try {
    for (const id of [A, B]) {
      await db.$executeRaw`INSERT INTO "Tenant" (id, name) VALUES (${id}, ${id})`;
      await db.$executeRaw`
        INSERT INTO "SiteContent" (id, "tenantId", key, "valueAr", "group", label, "updatedAt")
        VALUES (${`${id}-row`}, ${id}, 'probe.isolation', ${id}, 'probe', 'probe', now())`;
    }

    // اتصال التطبيق تحت هوية A. المرئي يجب أن يكون صفّ A وحده.
    const seen = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${A}, true)`;
      return tx.$queryRaw`SELECT "tenantId" FROM "SiteContent" WHERE key = 'probe.isolation'`;
    });

    const ids = seen.map((r) => r.tenantId);
    const leaked = ids.filter((t) => t !== A);
    const ownVisible = ids.includes(A);

    if (leaked.length > 0) {
      console.error(`\n✗ العزل معطّل — اتصال التطبيق تحت «${A}» رأى: ${leaked.join(', ')}`);
      console.error('  أي موظّف سيقرأ بيانات كل الشركات. أُوقفت التهيئة.');
      process.exit(1);
    }
    if (!ownVisible) {
      console.error('\n✗ اتصال التطبيق لا يرى حتى صفّ مستأجره — الصلاحيات ناقصة');
      process.exit(1);
    }
    say(`✓ رأى صفّه ولم يرَ الآخر — العزل نافذ\n`);
  } finally {
    await app.$disconnect().catch(() => {});
    await db.$executeRaw`DELETE FROM "Tenant" WHERE id IN (${A}, ${B})`.catch(() => {});
  }

  console.log('──────────────────────────────────────────────────');
  console.log('متغيّرات البيئة — انسخها كما هي:\n');
  for (const [k, v] of Object.entries(urls)) console.log(`${k}="${v}"`);
  console.log('──────────────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('\n✗', e.message.split('\n').slice(0, 4).join('\n  '));
    process.exit(1);
  })
  .finally(() => db.$disconnect());
