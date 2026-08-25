-- نظام الدستة: قطع الدستة (متغيّر لكل منتج) وتكلفة/سعر الدستة.
ALTER TABLE `Product` ADD COLUMN `piecesPerDozen` INTEGER NOT NULL DEFAULT 12;
ALTER TABLE `Product` ADD COLUMN `dozenCost` DECIMAL(19,4) NULL;
ALTER TABLE `Product` ADD COLUMN `dozenPrice` DECIMAL(19,4) NULL;
