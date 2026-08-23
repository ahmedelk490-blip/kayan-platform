-- رواتب الموظفين ومستحقاتهم.
--
-- حقلان على الموظف: راتب شهري ثابت ونسبة عمولة من أرباح فواتيره.
-- وجدول EmployeePayment: سجلّ كل حركة مالية مع الموظف (راتب/عمولة/مقابل
-- خدمة/مكافأة/خصم/سلفة) لتُجمَّع في كشف مستحقاته.

ALTER TABLE `User`
  ADD COLUMN `monthlySalary` DECIMAL(19, 4) NULL,
  ADD COLUMN `commissionPercent` DECIMAL(19, 4) NULL;

CREATE TABLE `EmployeePayment` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `periodMonth` INTEGER NULL,
    `periodYear` INTEGER NULL,
    `note` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeePayment_tenantId_employeeId_idx`(`tenantId`, `employeeId`),
    INDEX `EmployeePayment_tenantId_paidAt_idx`(`tenantId`, `paidAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmployeePayment` ADD CONSTRAINT `EmployeePayment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EmployeePayment` ADD CONSTRAINT `EmployeePayment_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `EmployeePayment` ADD CONSTRAINT `EmployeePayment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
