-- مصروفات ثابتة متكرّرة — قوالب تُسجَّل كل فترة.
CREATE TABLE `RecurringExpense` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `nameAr` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(19,4) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `RecurringExpense_tenantId_isActive_idx` (`tenantId`, `isActive`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `RecurringExpense` ADD CONSTRAINT `RecurringExpense_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
