-- الأطقم/السيريات: توزيع مقاسات جاهز للمنتج يتوسّع في الفاتورة بضغطة.
CREATE TABLE `ProductBundle` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `nameAr` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `ProductBundle_tenantId_productId_idx` (`tenantId`, `productId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductBundleLine` (
  `id` VARCHAR(191) NOT NULL,
  `bundleId` VARCHAR(191) NOT NULL,
  `sizeId` VARCHAR(191) NOT NULL,
  `quantity` INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ProductBundleLine_bundleId_sizeId_key` (`bundleId`, `sizeId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProductBundle` ADD CONSTRAINT `ProductBundle_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProductBundle` ADD CONSTRAINT `ProductBundle_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProductBundleLine` ADD CONSTRAINT `ProductBundleLine_bundleId_fkey` FOREIGN KEY (`bundleId`) REFERENCES `ProductBundle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProductBundleLine` ADD CONSTRAINT `ProductBundleLine_sizeId_fkey` FOREIGN KEY (`sizeId`) REFERENCES `Size`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
