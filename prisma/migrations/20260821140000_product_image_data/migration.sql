-- صور المنتجات المرفوعة من النظام: بايتات في القاعدة تنجو من النشر.
--
-- عمودان يُضافان فقط، بلا مسّ للصفوف القائمة: الصور القديمة ملفات على
-- القرص (data فارغ)، والمرفوعة تحمل بايتاتها ونوعها وتُقدَّم من مسار.
ALTER TABLE `ProductImage`
  ADD COLUMN `data` LONGBLOB NULL,
  ADD COLUMN `mimeType` VARCHAR(191) NOT NULL DEFAULT 'image/webp';
