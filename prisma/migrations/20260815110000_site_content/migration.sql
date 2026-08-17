-- نصوص الموقع العام — يحرّرها المدير من النظام بلا نشر.

CREATE TABLE "SiteContent" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "valueAr"   TEXT NOT NULL,
  "group"     TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteContent_tenantId_key_key" ON "SiteContent"("tenantId", "key");
CREATE INDEX "SiteContent_tenantId_group_idx" ON "SiteContent"("tenantId", "group");

ALTER TABLE "SiteContent" ADD CONSTRAINT "SiteContent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- جدول جديد يحمل tenantId يولد بسياسته لا تُضاف له لاحقاً: جدول بلا سياسة
-- مقروء من كل مستأجر. FORCE يشمل المالك أيضاً.
ALTER TABLE "SiteContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteContent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SiteContent";
CREATE POLICY tenant_isolation ON "SiteContent" AS PERMISSIVE FOR ALL TO PUBLIC
  USING ("tenantId" = app_tenant()) WITH CHECK ("tenantId" = app_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "SiteContent" TO kayan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SiteContent" TO kayan_auth;
