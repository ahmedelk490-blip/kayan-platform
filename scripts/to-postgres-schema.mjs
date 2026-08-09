/**
 * Convert the Prisma schema from SQLite to PostgreSQL.
 *
 * Two changes, both mechanical and both reviewable in the diff:
 *   1. datasource provider, plus a directUrl so migrations run as the owner
 *      while the application connects as a role that cannot bypass RLS.
 *   2. every Decimal field gains @db.Decimal(19, 4).
 *
 * Point 2 is the substantive one. On SQLite the DECIMAL column was
 * float-backed, so exactness had a ceiling of ~15 significant digits. On
 * PostgreSQL NUMERIC(19,4) is genuinely exact decimal storage, which is what
 * Phase 4.5 was always aiming at and could not reach.
 *
 * Idempotent: fields that already carry the attribute are left alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../prisma/schema.prisma', import.meta.url);
let schema = readFileSync(path, 'utf8');

// ── 1. datasource ───────────────────────────────────────────

schema = schema.replace(
  /datasource db \{[\s\S]*?\n\}/,
  `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  // Migrations and introspection run as the schema owner. The application's
  // own connection (url) is a role with neither ownership nor BYPASSRLS, so
  // it cannot escape the policies.
  directUrl = env("DIRECT_DATABASE_URL")
}`,
);

// ── 2. Decimal precision ────────────────────────────────────

let converted = 0;
schema = schema
  .split('\n')
  .map((line) => {
    // A field declaration whose type is Decimal or Decimal?, not already
    // annotated. Comments in this schema are always on their own line, so a
    // line-level match cannot catch prose.
    if (!/^\s+\w+\s+Decimal\??(\s|$)/.test(line)) return line;
    if (line.includes('@db.Decimal')) return line;
    converted += 1;
    return `${line.trimEnd()} @db.Decimal(19, 4)`;
  })
  .join('\n');

// ── 3. header ───────────────────────────────────────────────

const oldHeader = schema.slice(0, schema.indexOf('generator client'));
const newHeader = `// KAYAN ERP — database schema
//
// PostgreSQL (Phase 7). ADR-002 is now satisfied: the approved architecture
// was always PostgreSQL with Row-Level Security, and development ran on
// SQLite only because neither PostgreSQL nor Docker was installable here.
// Both deviations recorded in earlier phases are closed:
//
//   - RLS EXISTS. Every tenant-owned table has RLS enabled and FORCED, with
//     policies keyed on the app.tenant_id session setting. Forcing matters:
//     without it the table owner would silently bypass its own policies.
//     Tenant isolation is no longer repository-layer-only.
//
//   - MONEY AND QUANTITY ARE GENUINELY EXACT. Columns are NUMERIC(19,4).
//     On SQLite the DECIMAL column was float-backed and exact only below
//     ~15 significant digits; that ceiling is gone. Prisma still returns
//     Prisma.Decimal, so no application arithmetic changed.
//
//     Quantities are Decimal too, deliberately: quantity × unitPrice would
//     inherit float error from the quantity even if the price were exact.
//
// Conventions
//   - Master data soft-deletes (isDeleted + deletedAt); transactional data
//     never deletes.
//   - Every tenant-scoped table carries tenantId and indexes it first.
//   - Enums remain String with allowed values documented and enforced by Zod
//     at the application boundary. Promoting them to native Postgres enums is
//     a migration, not a redesign, and is deliberately not bundled with this
//     one — a data move and a type change should not fail together.

`;

schema = newHeader + schema.slice(oldHeader.length);

writeFileSync(path, schema);
console.log(`datasource -> postgresql`);
console.log(`Decimal fields annotated: ${converted}`);
