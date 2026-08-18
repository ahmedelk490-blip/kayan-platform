-- خصم المستلزمات لا يقع مرتين لنفس أمر الإنتاج.
--
-- فحص في التطبيق («هل خُصم من قبل؟») يمرّ عليه طلبان متزامنان معاً: كلاهما
-- يقرأ «لا»، وكلاهما يكتب. القيد على قاعدة البيانات لا يمرّ عليه اثنان.
--
-- productionOrderId فارغة تبقى بلا قيد عمداً: التسويات اليدوية على مستلزم
-- واحد قد تتكرّر بحق، وPostgreSQL يعتبر كل NULL مميّزاً فلا تتصادم.
CREATE UNIQUE INDEX "SupplyTransaction_production_supply_type_key"
  ON "SupplyTransaction"("productionOrderId", "supplyId", "type");
