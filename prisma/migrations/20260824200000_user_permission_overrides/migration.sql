-- تحكّم صلاحيات لكل موظف فوق دوره (ممنوح/مسحوب).
ALTER TABLE `User` ADD COLUMN `grantedPermissions` TEXT NULL;
ALTER TABLE `User` ADD COLUMN `deniedPermissions` TEXT NULL;
