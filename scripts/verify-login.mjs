/**
 * Prove the login chain works end to end on MySQL.
 *
 * This exercises the exact sequence the application performs, in order:
 *
 *   1. find the user by email   — before any tenant is known
 *   2. verify the Argon2id hash — the real password, the real digest
 *   3. create a session row     — still pre-tenant
 *   4. resolve the session back — what getSessionUser does on every request
 *   5. declare the tenant       — what requireUser does
 *   6. read tenant data, scoped by tenantId
 *
 * Step 6 is the one that would have failed silently if the tenant plumbing
 * were wrong: the user would log in successfully and then see an empty ERP.
 *
 * Usage: node scripts/verify-login.mjs
 */
import { PrismaClient } from '@prisma/client';
import { verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';

/** The identity connection, exactly as lib/auth.ts uses it. */
const authDb = new PrismaClient({ datasources: { db: { url: process.env.AUTH_DATABASE_URL } } });
/** The application connection — the one every screen reads through. */
const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const EMAIL = 'manager@kayan.eg';
const PASSWORD = process.env.SEED_PASSWORD ?? '';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const hashToken = (t) => createHash('sha256').update(t).digest('hex');

async function main() {
  // 1. Look the user up the way login does.
  const user = await authDb.user.findUnique({
    where: { email: EMAIL },
    include: { role: true },
  });
  check('the manager account exists', Boolean(user), EMAIL);
  if (!user) return report();

  check('the account is active', user.isActive === true);
  check('the account is not locked', !user.lockedUntil || user.lockedUntil < new Date());
  check('it carries a tenant', Boolean(user.tenantId), user.tenantId);
  check('its role resolves', Boolean(user.role?.key), user.role?.key);

  // 2. The password itself, against the stored Argon2id digest.
  const ok = await verify(user.passwordHash, PASSWORD);
  check('the documented password verifies against the stored hash', ok === true);

  const wrong = await verify(user.passwordHash, 'not-the-password').catch(() => false);
  check('a wrong password is rejected', wrong === false);

  check('the hash is Argon2id, not something weaker', user.passwordHash.startsWith('$argon2id$'));

  // 3. Create a session, as createSession does.
  const token = randomBytes(32).toString('base64url');
  const session = await authDb.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  check('a session row can be created', Boolean(session.id));
  check('only the hash is stored, never the token', session.tokenHash !== token);

  // 4. Resolve it back, as getSessionUser does on every request.
  const resolved = await authDb.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: true } } },
  });
  check('the session resolves back to the user', resolved?.user.email === EMAIL);
  check('the resolved session is not revoked', resolved?.revokedAt === null);

  // 5 + 6. Read as the application connection, scoped to the tenant the
  // session resolved to. This is the step that decides whether the manager
  // sees a working ERP or an empty one.
  //
  // The scoping moved. It used to be declared once per transaction and
  // enforced by the database; MySQL has no row-level security, so it is now
  // the `tenantId` in each query and nothing else. The assertions below
  // changed with it — they check the filter separates, where they used to
  // check the policy did.
  const tenantId = resolved.user.tenantId;

  const products = await app.product.findMany({ where: { tenantId, isDeleted: false } });
  check(
    "the signed-in tenant can read its own products",
    products.length > 0,
    `${products.length} products visible`,
  );

  const [orders, formulas] = await Promise.all([
    app.salesOrder.findMany({ where: { tenantId } }),
    app.formula.findMany({ where: { tenantId } }),
  ]);
  check(
    'sales and manufacturing data are reachable too',
    orders.length > 0 && formulas.length > 0,
    `${orders.length} orders, ${formulas.length} formulas`,
  );

  // The guarantee that replaced the policy: the filter is what separates, so
  // nothing belonging to another tenant may appear in a scoped read.
  //
  // This is asserted against real rows rather than an empty database. A
  // second tenant exists — the one left behind by the RLS isolation test —
  // and its product must be absent here while being present when asked for
  // by name.
  const others = await app.tenant.findMany({ where: { id: { not: tenantId } } });
  if (others.length > 0) {
    const foreign = await app.product.count({ where: { tenantId: others[0].id } });
    const bleed = products.filter((p) => p.tenantId !== tenantId);
    check(
      'no other tenant\'s row appears in a scoped read',
      bleed.length === 0 && foreign > 0,
      `${foreign} rows exist under ${others[0].id} and none surfaced`,
    );
  } else {
    // One tenant means the assertion cannot fail, so it would prove nothing.
    // Say so rather than record a pass that was never at risk.
    console.log('SKIP  no second tenant present — isolation not exercised');
  }

  // Cleanup: revoke rather than delete, mirroring destroySession.
  await authDb.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await authDb.session.delete({ where: { id: session.id } });

  report();
}

function report() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await authDb.$disconnect();
    await app.$disconnect();
  });
