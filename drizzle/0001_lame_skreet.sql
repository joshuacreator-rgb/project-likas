CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`message` text NOT NULL,
	`alertType` varchar(80) NOT NULL,
	`priority` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
	`targetAudience` enum('ALL_USERS','CITIZENS','STAFF','RESPONDERS','ADMIN') NOT NULL DEFAULT 'ALL_USERS',
	`expiresAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `center_staff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`centerId` int NOT NULL,
	`userId` int NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `center_staff_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evacuation_centers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`centerCode` varchar(32) NOT NULL,
	`name` varchar(180) NOT NULL,
	`address` text NOT NULL,
	`barangay` varchar(100) NOT NULL,
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`maximumCapacity` int NOT NULL,
	`currentOccupancy` int NOT NULL DEFAULT 0,
	`contactPerson` varchar(120),
	`contactNumber` varchar(40),
	`status` enum('OPEN','FULL','CLOSED','UNDER_MAINTENANCE','EMERGENCY_ONLY') NOT NULL DEFAULT 'OPEN',
	`facilities` text,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `evacuation_centers_id` PRIMARY KEY(`id`),
	CONSTRAINT `evacuation_centers_centerCode_unique` UNIQUE(`centerCode`)
);
--> statement-breakpoint
CREATE TABLE `evacuees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`firstName` varchar(80) NOT NULL,
	`middleName` varchar(80),
	`lastName` varchar(80) NOT NULL,
	`age` int NOT NULL,
	`sex` enum('FEMALE','MALE','OTHER','UNSPECIFIED') NOT NULL DEFAULT 'UNSPECIFIED',
	`contactNumber` varchar(40),
	`address` text,
	`barangay` varchar(100),
	`emergencyContact` varchar(140),
	`medicalNotes` text,
	`specialNeeds` text,
	`centerId` int NOT NULL,
	`registrationDate` timestamp NOT NULL DEFAULT (now()),
	`status` enum('ACTIVE','TRANSFERRED','RELEASED') NOT NULL DEFAULT 'ACTIVE',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `evacuees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidence_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resource_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('STOCK_IN','STOCK_OUT','TRANSFER','BORROW','RETURN') NOT NULL,
	`quantity` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resource_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`category` varchar(80) NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`unit` varchar(30) NOT NULL,
	`minimumStock` int NOT NULL DEFAULT 0,
	`centerId` int NOT NULL,
	`expirationDate` timestamp,
	`status` enum('AVAILABLE','LOW_STOCK','OUT_OF_STOCK','EXPIRED') NOT NULL DEFAULT 'AVAILABLE',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `responder_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`responderId` int NOT NULL,
	`action` text NOT NULL,
	`resourcesUsed` text,
	`arrivalAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `responder_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportCode` varchar(32) NOT NULL,
	`reporterId` int,
	`reportType` varchar(80) NOT NULL,
	`description` text NOT NULL,
	`location` text NOT NULL,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`priority` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
	`status` enum('PENDING','VERIFIED','IN_PROGRESS','RESOLVED','REJECTED') NOT NULL DEFAULT 'PENDING',
	`assignedResponderId` int,
	`resolution` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `risk_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `risk_reports_reportCode_unique` UNIQUE(`reportCode`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(120) NOT NULL,
	`settingValue` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `weather_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`location` varchar(120) NOT NULL,
	`temperatureC` decimal(5,2),
	`condition` varchar(100),
	`warning` text,
	`provider` varchar(80),
	`observedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weather_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','staff','responder','citizen') NOT NULL DEFAULT 'citizen';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(40);--> statement-breakpoint
CREATE INDEX `center_barangay_idx` ON `evacuation_centers` (`barangay`);--> statement-breakpoint
CREATE INDEX `report_status_idx` ON `risk_reports` (`status`);--> statement-breakpoint
CREATE INDEX `report_priority_idx` ON `risk_reports` (`priority`);