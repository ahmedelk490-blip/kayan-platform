-- طلبات الموقع: العميل يطلب منتجاً بمقاسه ولونه، والمندوب يحوّله لفاتورة.
CREATE TABLE `WebOrder` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `number` VARCHAR(191) NOT NULL,
  `customerName` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NOT NULL,
  `company` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `invoiceId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `WebOrder_tenantId_status_idx` (`tenantId`, `status`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WebOrderLine` (
  `id` VARCHAR(191) NOT NULL,
  `webOrderId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `variantId` VARCHAR(191) NULL,
  `productLabel` VARCHAR(191) NOT NULL,
  `colorLabel` VARCHAR(191) NULL,
  `sizeLabel` VARCHAR(191) NULL,
  `quantity` INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  INDEX `WebOrderLine_webOrderId_idx` (`webOrderId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WebOrder` ADD CONSTRAINT `WebOrder_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WebOrderLine` ADD CONSTRAINT `WebOrderLine_webOrderId_fkey` FOREIGN KEY (`webOrderId`) REFERENCES `WebOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
