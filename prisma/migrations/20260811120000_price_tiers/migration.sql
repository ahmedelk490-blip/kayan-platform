-- شرائح الأسعار — سعر البيع حسب الخدمة والكمية.
--
-- سعر واحد لكل منتج لم يكن يكفي: القطعة لها سعر مع التطريز وآخر مع طباعة
-- DTF، ولكلٍّ سعر جملة وسعر للكميات الصغيرة. نصف أسعار الإدارة كان غير
-- قابل للإدخال أصلاً.

CREATE TABLE "PriceTier" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "service"   TEXT NOT NULL,
  "minQty"    INTEGER NOT NULL DEFAULT 1,
  "maxQty"    INTEGER,
  "price"     DECIMAL(19,4) NOT NULL,
  "currency"  TEXT NOT NULL DEFAULT 'IQD',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- لا شريحتان بنفس المفتاح. القيد على قاعدة البيانات لا على التطبيق: فحصٌ
-- في الكود يمرّ عليه طلبان متزامنان، والقيد لا يمرّ عليه شيء.
CREATE UNIQUE INDEX "PriceTier_productId_variantId_service_minQty_key"
  ON "PriceTier"("productId", "variantId", "service", "minQty");
CREATE INDEX "PriceTier_tenantId_productId_idx" ON "PriceTier"("tenantId", "productId");

ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── العزل ────────────────────────────────────────────────
--
-- جدول جديد يحمل tenantId يجب أن يولد بسياسته، لا أن تُضاف لاحقاً. جدول
-- بلا سياسة مقروء من كل مستأجر، وهي الحالة التي تجعل العزل ادّعاءً.
-- FORCE يشمل المالك أيضاً: بدونه يتجاوز المالك سياسته الخاصة.
ALTER TABLE "PriceTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceTier" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PriceTier";
CREATE POLICY tenant_isolation ON "PriceTier" AS PERMISSIVE FOR ALL TO PUBLIC
  USING ("tenantId" = app_tenant()) WITH CHECK ("tenantId" = app_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "PriceTier" TO kayan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PriceTier" TO kayan_auth;
