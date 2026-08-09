# Phase 7 — SQLite → PostgreSQL + Row-Level Security

**Status:** delivered · **Date:** 2026-08-09 · **Tag:** `phase-07-postgres-rls`

ADR-002 has been carrying two open deviations since Phase 3. Both are now
closed: tenant isolation is enforced by the database, and money is stored as
genuinely exact decimal.

---

## The environment question, answered before anything was installed

The brief said to propose an alternative if Docker was unavailable or disk
space was tight. Both were true, so I stopped and asked.

| Probe | Result |
|---|---|
| `psql`, `pg_ctl`, `initdb` | absent |
| `docker`, `podman` | absent |
| WSL distro | none installed |
| **C: free space** | **1.7 GB of 118.5 GB (98.6% full)** |
| D: free space | 55.8 GB |

`winget` and `choco` exist but install to C: by default. Docker Desktop needs
several GB there. With 1.7 GB free, that was a genuine risk of filling the
system drive, so it was your call, not mine.

**You approved portable binaries on D:.** PostgreSQL 17.5, extracted to
`D:\dev-cache\pgsql` — no installer, no service, no registry, no admin
rights, nothing written to C:, removable by deleting one folder. Setup and
teardown are documented in [`docs/POSTGRES-SETUP.md`](../POSTGRES-SETUP.md).

One correction I owe you: I estimated ~130 MB for the download. The real file
is **307 MB** (829 MB extracted). I flagged that before proceeding because the
size was material to a disk-space decision.

---

## 1. Schema changes

**Datasource** now `postgresql`, with a `directUrl` so migrations run as the
schema owner while the application connects as a role that cannot escape RLS.

**81 Decimal fields** annotated `@db.Decimal(19, 4)` → real `NUMERIC(19,4)`
columns. This is the substantive change. On SQLite the DECIMAL column was
float-backed and exact only below ~15 significant digits — a ceiling Phase 4.5
documented and could not remove. It is gone. Prisma still returns
`Prisma.Decimal`, so **no application arithmetic changed**.

**Migrations rebaselined.** The seven SQLite migrations are SQLite DDL and
cannot run on PostgreSQL. They are archived to `prisma/migrations-sqlite/`
(not deleted — they remain the record of how the SQLite schema was reached),
and the PostgreSQL history starts from one baseline of 50 tables.

**Enums deliberately left as String.** Promoting them to native Postgres enums
is a migration, not a redesign, and bundling it here would mean a data move
and a type change could fail together.

---

## 2. Data migration

`scripts/migrate-to-postgres.mjs` reads SQLite through `node:sqlite` and
writes through Prisma, so the type conversions are the ones Prisma will
perform for the rest of the application's life. Decimals go across **as
strings**, never as JS numbers — passing a float would reintroduce exactly the
error this migration removes.

Insert order is dependency order, because PostgreSQL actually enforces the
foreign keys SQLite was only documenting.

```
338 rows read from SQLite
338 rows written to PostgreSQL
  5 forward references fixed (Formula.currentVersionId)
```

### Proof of zero data loss — 18/18

`node --experimental-sqlite scripts/verify-postgres-migration.mjs`

| Check | Result |
|---|---|
| No row from any of 50 tables went missing | all 338 found by id |
| All money and quantity values survived exactly | **287 values, no drift** |
| Money columns are real NUMERIC(19,4) | confirmed from `information_schema` |
| Sales order total byte-identical | 5130 → 5130 |
| Pricing snapshot unchanged | unit 180, total 5130 |
| Cost snapshot unchanged, lines still sum | 19658.375 → 19658.375 |
| Reservation idempotency constraint present | `StockMovement_salesOrderLineId_type_key` |
| Production receipt idempotency constraint present | `StockMovement_productionOrderId_type_key` |
| Every user and password hash intact | 4 users |
| Arabic round-tripped through UTF8 | تيشيرت الموديل 1 |

One methodological correction: my first version compared row **counts** and
failed with `StockMovement: sqlite=8 pg=12`. Those four extra rows were
appended by the verification suites running against PostgreSQL — the ledger
doing its job. Zero data loss means *nothing went missing*, not *counts are
frozen*, so the check now tests containment by id and reports appended rows
separately. The test was measuring the wrong property; the data was fine.

A backup of the SQLite database was taken before any of this:
`data/backups/kayan-pre-postgres-20260809-164029.db`.

---

## 3. Row-Level Security

### Three roles, because RLS is only real if the app cannot bypass it

| Role | Superuser | BYPASSRLS | Used by |
|---|---|---|---|
| `kayan_owner` | no | no | `prisma migrate` only |
| `kayan_app` | **no** | **no** | the application |
| `kayan_auth` | no | **yes** | `lib/auth.ts` + login action, nothing else |

`FORCE ROW LEVEL SECURITY` is set on every protected table. Without it, the
table owner silently bypasses its own policies — the single most common way an
RLS deployment turns out to be decorative.

### Coverage — 47 tables

- **24 tables** carry `tenantId`: policy compares it directly.
- **22 child tables** have no `tenantId` and reach one through their parent
  via `EXISTS`. Without these, anyone holding a child row's id could read it
  directly — precisely the hole the repository layer was papering over.
  `Attachment` needed a six-way predicate, one per possible owner.
- **4 tables** genuinely global, RLS off with the reason recorded next to
  each: `Role`, `Permission`, `RolePermission`, `_prisma_migrations`.

Policies are generated by `scripts/generate-rls.mjs` rather than hand-written,
because 47 tables of near-identical SQL is exactly where a typo becomes a
silent tenant leak.

### Deny by default

```sql
CREATE FUNCTION app_tenant() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.tenant_id', true) $$;
```

The `true` makes a missing setting return NULL instead of raising. NULL never
equals anything, so a connection that forgets to declare a tenant **sees
nothing at all** rather than seeing everything.

### How the application declares its tenant

The tenant lives in `AsyncLocalStorage`, set once by `requireUser()` — which
every protected route already calls as its first statement. **No server action
or page needed changing.** A route that forgets to guard itself gets no
tenant, and is therefore denied by policy rather than quietly reading the
whole table.

Every query then runs as a two-statement transaction: `set_config` scoped to
the transaction, then the query. That is not belt-and-braces — Prisma pools
connections, so setting the tenant on one connection and querying on another
is a live race. Transaction-scoping also stops the setting leaking to the next
borrower of a pooled connection, which is tested explicitly.

The cost is one extra round trip per query. That is what it costs to have the
database, rather than the application, enforce isolation.

**A real bug found while doing this:** interactive transactions
(`prisma.$transaction(cb)`) bypass the extension, so all eight of them would
have opened a transaction with no tenant and had every statement refused. They
now use `tenantTransaction`, which declares the tenant inside the transaction
and hands back a plain client.

### Isolation test — 19/19, attacked rather than asserted

`node scripts/verify-rls.mjs` creates a second tenant with its own product and
variant, then tries to break out **as the application role**:

| Attack | Result |
|---|---|
| Query with no tenant declared | **0 rows** (products, customers, orders) |
| Read rival product **by primary key** | **denied** |
| Find it by SKU | **denied** |
| Read rival's variant (table has no `tenantId`) | **denied by the parent policy** |
| `UPDATE` rival product | **0 rows**, record verified untouched |
| `DELETE` rival product | **0 rows** |
| `INSERT` a row into the rival tenant | **refused by WITH CHECK** |
| Tenant setting leaking to the next pooled connection | **does not leak** |
| `kayan_app` superuser / BYPASSRLS | **no / no** |
| RLS tables enabled but not FORCED | **0** |

Each tenant sees its own and only its own: 7 + 1 = 8 total, and neither sees 8.

---

## 4. Validation

| Suite | Result |
|---|---|
| `verify-phase3` (core data) | 16/16 |
| `verify-decimal` (money exactness) | 16/16 |
| `verify-phase4` (sales, reservations) | 18/18 |
| `verify-phase5` (manufacturing) | 35/35 |
| `verify-phase6` (formula + cost) | 46/46 |
| `verify-phase65` (real formulas, operations) | 55/55 |
| `verify-postgres-migration` | 18/18 |
| `verify-rls` | 19/19 |
| **total** | **223 assertions** |

Those suites create quotations, sales orders with reservations, production
orders with receipts, cost calculations, expenses, damage records and
penalties — all on PostgreSQL, all passing. Pricing-snapshot immutability,
cost-snapshot immutability, reservation idempotency, production-receipt
idempotency and soft delete are each covered by their existing suite and were
re-run unchanged.

`npm run lint` · `npm run typecheck` · `npm run build` — all clean, no
warnings.

---

## Issues and honest caveats

1. **The login path holds `BYPASSRLS`.** It has to: finding which tenant an
   email belongs to is what logging in *is*. The exception is one role used by
   two files, and it is greppable. It is still the largest remaining hole — a
   flaw in `lib/auth.ts` or `login/actions.ts` crosses tenants where a flaw
   anywhere else cannot.

2. **`kayan_auth` is granted DML on every table, not just the identity ones.**
   Narrowing that grant to `User`, `Session` and `AuditLog` would shrink the
   blast radius, and I would do it before production.

3. **One extra round trip per query.** Measurable under load. The alternative
   is a per-request connection, which trades a different cost.

4. **Passwords are development values in `.env`.** Production must supply its
   own; `.env` is gitignored.

5. **The cluster does not start with Windows.** Run `pg_ctl start` before
   `npm run dev`. Documented, but it will catch someone.

6. **Enums are still String**, and native Postgres enums remain available as a
   later, separate migration.

7. **The SQLite database is untouched and still on disk**, plus a timestamped
   backup. Nothing was deleted, so the old state is recoverable.

---

## Files

**New:** `prisma/postgres/00-bootstrap.sql` ·
`prisma/migrations/20260809170000_postgres_baseline/` ·
`prisma/migrations/20260809180000_row_level_security/` ·
`scripts/to-postgres-schema.mjs` · `scripts/migrate-to-postgres.mjs` ·
`scripts/generate-rls.mjs` · `scripts/verify-postgres-migration.mjs` ·
`scripts/verify-rls.mjs` · `apps/web/src/lib/tenant-context.ts` ·
`docs/POSTGRES-SETUP.md`

**Changed:** `prisma/schema.prisma` (datasource + 81 Decimal annotations +
header) · `apps/web/src/lib/prisma.ts` (tenant extension, `tenantTransaction`,
`authDb`) · `apps/web/src/lib/guard.ts` (sets the tenant) ·
`apps/web/src/lib/auth.ts` and `app/login/actions.ts` (use `authDb`) ·
8 action files (interactive transactions) · 14 tooling scripts (maintenance
connection) · `.env`
