-- Phase 7 bootstrap — database and roles.
--
-- Three roles, because RLS is only real if the application cannot bypass it:
--
--   kayan_owner  owns the schema and runs migrations. Owns the tables, so it
--                would bypass RLS - which is why FORCE ROW LEVEL SECURITY is
--                set on every table later, closing exactly that hole.
--   kayan_app    what the running application connects as. No superuser, no
--                BYPASSRLS, does not own anything. Its visibility is decided
--                entirely by policy.
--   kayan_auth   the one narrow exception. Login has to find a user by email
--                before anyone knows which tenant they belong to, so this
--                role holds BYPASSRLS and is used by the credential and
--                session lookups only.
--
-- Passwords here are local development values. Production supplies its own
-- through the environment.

SELECT 'CREATE DATABASE kayan_erp ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kayan_erp')\gexec

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kayan_owner') THEN
    CREATE ROLE kayan_owner LOGIN PASSWORD 'kayan_owner_dev_2026';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kayan_app') THEN
    CREATE ROLE kayan_app LOGIN PASSWORD 'kayan_app_dev_2026';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kayan_auth') THEN
    CREATE ROLE kayan_auth LOGIN PASSWORD 'kayan_auth_dev_2026' BYPASSRLS;
  END IF;
END
$$;

ALTER DATABASE kayan_erp OWNER TO kayan_owner;
