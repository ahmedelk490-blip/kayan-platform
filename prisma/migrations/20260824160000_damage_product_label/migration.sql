-- اسم منتج يدوي للهالك غير المرتبط بمنتج في النظام.
ALTER TABLE `DamageRecord` ADD COLUMN `productLabel` VARCHAR(191) NULL;
