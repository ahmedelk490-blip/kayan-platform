# Running PostgreSQL locally

The development cluster is a **portable PostgreSQL 17.5** living entirely
under `D:\dev-cache`. Nothing is installed on `C:`, no Windows service is
registered, and no administrator rights are needed.

That choice was forced by the machine: `C:` had **1.7 GB free of 118.5 GB**,
and Docker Desktop or the official installer both want several gigabytes
there. The portable binaries are removable by deleting one folder.

## Layout

| Path | What |
|---|---|
| `D:\dev-cache\pgsql` | binaries, 829 MB extracted |
| `D:\dev-cache\pgdata` | the data cluster |
| `D:\dev-cache\pglog\server.log` | server log |
| `D:\dev-cache\downloads` | the 307 MB source zip |

Port **5433**, deliberately not 5432, so a future official install cannot
collide with this one.

## Starting and stopping

```bash
D:\dev-cache\pgsql\bin\pg_ctl.exe -D D:\dev-cache\pgdata -l D:\dev-cache\pglog\server.log -w start
```

```bash
D:\dev-cache\pgsql\bin\pg_ctl.exe -D D:\dev-cache\pgdata -w stop
```

```bash
D:\dev-cache\pgsql\bin\pg_isready.exe -h 127.0.0.1 -p 5433
```

The server does **not** start with Windows. Start it before `npm run dev`.

## Rebuilding from scratch

If the cluster is ever lost, this reproduces it. Steps 1–2 are only needed if
`D:\dev-cache\pgsql` is missing.

1. Download the binaries (307 MB):
   `https://get.enterprisedb.com/postgresql/postgresql-17.5-1-windows-x64-binaries.zip`
2. Extract so that `D:\dev-cache\pgsql\bin\initdb.exe` exists.
3. Initialise the cluster:

```bash
D:\dev-cache\pgsql\bin\initdb.exe -D D:\dev-cache\pgdata -U postgres --pwfile=<file> --encoding=UTF8 --locale=C -A scram-sha-256
```

   `--locale=C` is deliberate. It keeps ordering byte-deterministic, which is
   what SQLite was already doing; a linguistic collation would silently
   reorder every Arabic list in the application.

4. Set `port = 5433` in `D:\dev-cache\pgdata\postgresql.conf`.
   **Write that file without a BOM** — PowerShell's `-Encoding utf8` adds one
   and PostgreSQL refuses to start with `syntax error ... line 1`.
5. Start the server, then create roles and database:

```bash
D:\dev-cache\pgsql\bin\psql.exe -h 127.0.0.1 -p 5433 -U postgres -d postgres -f prisma/postgres/00-bootstrap.sql
```

6. Apply the schema and policies, then load data:

```bash
npx prisma migrate deploy
```

```bash
node --experimental-sqlite scripts/migrate-to-postgres.mjs
```

## The four connections

`.env` holds four URLs, and the difference between them is the security model.

| Variable | Role | Why |
|---|---|---|
| `DATABASE_URL` | `kayan_app` | what the application uses. Owns nothing, holds no `BYPASSRLS`. Sees only what policy allows. |
| `DIRECT_DATABASE_URL` | `kayan_owner` | `prisma migrate` only. Owns the tables, but every table `FORCE`s RLS so ownership grants no read access. |
| `AUTH_DATABASE_URL` | `kayan_auth` | the single `BYPASSRLS` role. Used by `lib/auth.ts` and the login action and nothing else, because finding a user by email must happen before the tenant is known. |
| `MAINTENANCE_DATABASE_URL` | `postgres` | superuser, for tooling that legitimately spans tenants: seeding and the verification suites. Never used by the application. |

Development passwords are in `.env`, which is gitignored. Production supplies
its own.

## Verifying

```bash
node --experimental-sqlite scripts/verify-postgres-migration.mjs
```

```bash
node scripts/verify-rls.mjs
```

## Gotchas met on the way

- **PowerShell `-Encoding utf8` writes a BOM.** It broke `postgresql.conf` and
  it will break any `.sql` file you generate the same way. Use
  `[System.IO.File]::WriteAllText` with `UTF8Encoding($false)`.
- **`FORCE ROW LEVEL SECURITY` binds the owner too.** That is the point, but
  it means seed and verification scripts must use the maintenance connection
  or they will silently see zero rows.
- **Interactive transactions bypass the tenant extension.** Use
  `tenantTransaction` from `lib/prisma.ts`, never `prisma.$transaction(cb)`.
