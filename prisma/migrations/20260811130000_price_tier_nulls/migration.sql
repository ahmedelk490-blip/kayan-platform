-- قيد التفرّد كان لا يمنع شيئاً حين يكون variantId فارغاً.
--
-- PostgreSQL يعتبر كل NULL مميّزاً عن غيره افتراضياً، فصفّان بنفس المنتج
-- والخدمة والحد الأدنى و variantId فارغ في كليهما يمرّان معاً — وهو بالضبط
-- الشكل الشائع للشريحة (سعر للمنتج كله لا لمتغيّر بعينه).
--
-- NULLS NOT DISTINCT يجعل الفراغين متساويين، فيصير القيد فعّالاً.
DROP INDEX IF EXISTS "PriceTier_productId_variantId_service_minQty_key";
CREATE UNIQUE INDEX "PriceTier_productId_variantId_service_minQty_key"
  ON "PriceTier"("productId", "variantId", "service", "minQty") NULLS NOT DISTINCT;
