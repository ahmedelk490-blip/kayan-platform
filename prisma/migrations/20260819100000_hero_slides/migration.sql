-- شرائح واجهة الصفحة الرئيسية (Hero slider)، يتحكّم بها المدير من النظام.
--
-- الصورة LONGBLOB لا مسار: القرص يُمسح مع كل نشر على الاستضافة المشتركة،
-- فبايتات في القاعدة هي الطريق الوحيد لتنجو صورة مرفوعة من التحديث التالي.
-- تُحسَّن webp عند الرفع فلا تثقل، وتُنقل مع النسخ الاحتياطي للقاعدة.

CREATE TABLE `HeroSlide` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `subtitle` VARCHAR(191) NOT NULL DEFAULT '',
    `image` LONGBLOB NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL DEFAULT 'image/webp',
    `width` INTEGER NOT NULL DEFAULT 0,
    `height` INTEGER NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HeroSlide_tenantId_sortOrder_idx`(`tenantId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `HeroSlide` ADD CONSTRAINT `HeroSlide_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
