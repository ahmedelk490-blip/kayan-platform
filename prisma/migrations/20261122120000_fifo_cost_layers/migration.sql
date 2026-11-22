-- AlterTable
ALTER TABLE `InvoiceLine` ADD COLUMN `unitCost` DECIMAL(19, 4) NULL;

-- CreateTable
CREATE TABLE `CostLayer` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `colorId` VARCHAR(191) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `quantity` DECIMAL(19, 4) NOT NULL,
    `remaining` DECIMAL(19, 4) NOT NULL,
    `unitCost` DECIMAL(19, 4) NOT NULL,
    `note` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CostLayer_tenantId_productId_colorId_receivedAt_idx`(`tenantId`, `productId`, `colorId`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CostLayerUse` (
    `id` VARCHAR(191) NOT NULL,
    `layerId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(19, 4) NOT NULL,
    `unitCost` DECIMAL(19, 4) NOT NULL,

    INDEX `CostLayerUse_invoiceId_idx`(`invoiceId`),
    INDEX `CostLayerUse_layerId_idx`(`layerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
