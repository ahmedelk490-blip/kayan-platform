-- تقسيط الجزاء: عدد الأقساط وما استُقطع فعلاً.
--
-- جزاءٌ يعادل راتب شهر يُستقطع دفعةً واحدة يترك الموظّف بلا شيء.

ALTER TABLE `Penalty` ADD COLUMN `installments` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `Penalty` ADD COLUMN `collectedAmount` DECIMAL(19,4) NOT NULL DEFAULT 0;
