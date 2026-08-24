-- محور استقلالي لظهور المنتج على الموقع، منفصل عن حالته الداخلية.
ALTER TABLE `Product` ADD COLUMN `showOnSite` BOOLEAN NOT NULL DEFAULT true;
