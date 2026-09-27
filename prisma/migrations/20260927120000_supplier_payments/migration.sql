-- ذمم الموردين: المدفوع على أمر الشراء، وجدول دفعات المورّد.
--
-- النظام كان يعرف ما لنا عند الزبائن بدقة ولا يعرف ما علينا للموردين أبداً.

ALTER TABLE `PurchaseOrder` ADD COLUMN `paidAmount` DECIMAL(19,4) NOT NULL DEFAULT 0;

CREATE TABLE `SupplierPayment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `number` VARCHAR(191) NOT NULL,
  `supplierId` VARCHAR(191) NOT NULL,
  `purchaseOrderId` VARCHAR(191) NULL,
  `amount` DECIMAL(19,4) NOT NULL,
  `method` VARCHAR(191) NOT NULL DEFAULT 'CASH',
  `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reference` VARCHAR(191) NULL,
  `notes` VARCHAR(191) NULL,
  `reversesId` VARCHAR(191) NULL,
  `recordedById` VARCHAR(191) NULL,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SupplierPayment_reversesId_key`(`reversesId`),
  UNIQUE INDEX `SupplierPayment_tenantId_number_key`(`tenantId`, `number`),
  INDEX `SupplierPayment_tenantId_isDeleted_idx`(`tenantId`, `isDeleted`),
  INDEX `SupplierPayment_supplierId_idx`(`supplierId`),
  INDEX `SupplierPayment_purchaseOrderId_idx`(`purchaseOrderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_purchaseOrderId_fkey`
  FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_reversesId_fkey`
  FOREIGN KEY (`reversesId`) REFERENCES `SupplierPayment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_recordedById_fkey`
  FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
