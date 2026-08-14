/**
 * إنشاء حساب مدير — أو تحديث كلمته.
 *
 * لا تُكتب كلمة المرور في هذا الملف. تُمرَّر عبر البيئة، فلا تدخل المستودع
 * ولا سجلّ الأوامر:
 *
 *   KAYAN_EMAIL=... KAYAN_PASSWORD=... node --experimental-strip-types \
 *     --env-file=.env scripts/create-manager.mjs
 *
 * يستخدم نفس معاملات Argon2id التي تستخدمها البذرة، فحساب أُنشئ من هنا
 * لا يختلف في شيء عن حساب أُنشئ من هناك.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const T = 'kayan';

const email = process.env.KAYAN_EMAIL;
const password = process.env.KAYAN_PASSWORD;
const nameAr = process.env.KAYAN_NAME_AR ?? 'مدير كيان';
const roleKey = process.env.KAYAN_ROLE ?? 'MANAGER';

if (!email || !password) {
  console.error('مطلوب: KAYAN_EMAIL و KAYAN_PASSWORD');
  process.exit(1);
}

async function main() {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new Error(`الدور ${roleKey} غير موجود — شغّل البذرة أولاً.`);

  const passwordHash = await hash(password, ARGON2_OPTIONS);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      tenantId: T,
      email,
      passwordHash,
      name: 'KAYAN Manager',
      nameAr,
      roleId: role.id,
      isActive: true,
    },
    // تحديث كلمة المرور يمسح القفل وعدّاد المحاولات الفاشلة: كلمة جديدة
    // على حساب مقفل يجب أن تفتحه، لا أن تُترك تحت قفل سببه القديم.
    update: {
      passwordHash,
      roleId: role.id,
      isActive: true,
      failedLogins: 0,
      lockedUntil: null,
    },
  });

  console.log(`الحساب: ${user.email}`);
  console.log(`الدور : ${roleKey} → يهبط على ${roleKey === 'MANAGER' ? '/dashboard' : '/'} `);
  console.log('كلمة المرور لم تُطبع ولن تُطبع.');
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
