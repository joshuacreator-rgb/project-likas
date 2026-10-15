ALTER TABLE `risk_reports` ADD `reportedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `risk_reports` ADD `respondedAt` timestamp NULL;
ALTER TABLE `risk_reports` ADD `resolvedAt` timestamp NULL;
ALTER TABLE `risk_reports` ADD `rejectedAt` timestamp NULL;
--> statement-breakpoint
UPDATE `risk_reports` SET `reportedAt` = COALESCE(`reportedAt`, `createdAt`) WHERE `reportedAt` IS NULL OR `reportedAt` = '0000-00-00 00:00:00';
"