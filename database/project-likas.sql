CREATE DATABASE IF NOT EXISTS `likas_system` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `likas_system`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `openId` varchar(64) NOT NULL,
  `name` text,
  `email` varchar(320),
  `loginMethod` varchar(64),
  `accountStatus` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'APPROVED',
  `role` enum('user','admin','staff','responder','citizen') NOT NULL DEFAULT 'citizen',
  `phone` varchar(40),
  `firstName` varchar(80),
  `middleName` varchar(80),
  `lastName` varchar(80),
  `address` text,
  `age` int,
  `emailVerifiedAt` timestamp NULL,
  `isDemo` boolean NOT NULL DEFAULT false,
  `demoExpiresAt` timestamp NULL,
  `demoRevokedAt` timestamp NULL,
  `demoRevokedBy` int,
  `twoFactorSecret` varchar(64),
  `twoFactorEnabled` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_openId_unique` (`openId`)
);

CREATE TABLE IF NOT EXISTS `auth_credentials` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `email` varchar(320) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `resetTokenHash` varchar(255),
  `resetExpiresAt` timestamp NULL,
  `emailVerificationTokenHash` varchar(255),
  `emailVerificationExpiresAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_credentials_email_unique` (`email`),
  CONSTRAINT `auth_credentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `evacuation_centers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `centerCode` varchar(32) NOT NULL,
  `name` varchar(180) NOT NULL,
  `nameFilipino` varchar(180),
  `address` text NOT NULL,
  `addressFilipino` text,
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
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `evacuation_centers_centerCode_unique` (`centerCode`),
  KEY `center_barangay_idx` (`barangay`)
);

CREATE TABLE IF NOT EXISTS `invitations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(320) NOT NULL,
  `name` varchar(120) NOT NULL,
  `role` enum('staff','responder') NOT NULL,
  `tokenHash` varchar(255) NOT NULL,
  `invitedBy` int NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `acceptedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invitations_tokenHash_unique` (`tokenHash`),
  CONSTRAINT `invitations_invitedBy_users_id_fk` FOREIGN KEY (`invitedBy`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `alerts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(180) NOT NULL,
  `titleFilipino` varchar(180),
  `message` text NOT NULL,
  `messageFilipino` text,
  `alertType` varchar(80) NOT NULL,
  `priority` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `targetAudience` enum('ALL_USERS','CITIZENS','STAFF','RESPONDERS','ADMIN') NOT NULL DEFAULT 'ALL_USERS',
  `expiresAt` timestamp NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `alerts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `center_staff` (
  `id` int AUTO_INCREMENT NOT NULL,
  `centerId` int NOT NULL,
  `userId` int NOT NULL,
  `assignedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `center_staff_centerId_evacuation_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `evacuation_centers` (`id`),
  CONSTRAINT `center_staff_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `evacuees` (
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
  `registrationDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('ACTIVE','TRANSFERRED','RELEASED') NOT NULL DEFAULT 'ACTIVE',
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `evacuees_centerId_evacuation_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `evacuation_centers` (`id`)
);

CREATE TABLE IF NOT EXISTS `resources` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(120) NOT NULL,
  `category` varchar(80) NOT NULL,
  `quantity` int NOT NULL DEFAULT 0,
  `unit` varchar(30) NOT NULL,
  `minimumStock` int NOT NULL DEFAULT 0,
  `centerId` int NOT NULL,
  `expirationDate` timestamp NULL,
  `status` enum('AVAILABLE','LOW_STOCK','OUT_OF_STOCK','EXPIRED') NOT NULL DEFAULT 'AVAILABLE',
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `resources_centerId_evacuation_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `evacuation_centers` (`id`)
);

CREATE TABLE IF NOT EXISTS `resource_transactions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `resourceId` int NOT NULL,
  `userId` int NOT NULL,
  `type` enum('STOCK_IN','STOCK_OUT','TRANSFER','BORROW','RETURN') NOT NULL,
  `quantity` int NOT NULL,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `resource_transactions_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources` (`id`),
  CONSTRAINT `resource_transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `risk_reports` (
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
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `risk_reports_reportCode_unique` (`reportCode`),
  KEY `report_status_idx` (`status`),
  KEY `report_priority_idx` (`priority`),
  CONSTRAINT `risk_reports_reporterId_users_id_fk` FOREIGN KEY (`reporterId`) REFERENCES `users` (`id`),
  CONSTRAINT `risk_reports_assignedResponderId_users_id_fk` FOREIGN KEY (`assignedResponderId`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `evidence_files` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reportId` int NOT NULL,
  `fileKey` varchar(500) NOT NULL,
  `fileUrl` varchar(1000) NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `mimeType` varchar(120) NOT NULL,
  `sizeBytes` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `evidence_files_reportId_risk_reports_id_fk` FOREIGN KEY (`reportId`) REFERENCES `risk_reports` (`id`)
);

CREATE TABLE IF NOT EXISTS `weather_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `location` varchar(120) NOT NULL,
  `temperatureC` decimal(5,2),
  `condition` varchar(100),
  `warning` text,
  `provider` varchar(80),
  `observedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `responder_actions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reportId` int NOT NULL,
  `responderId` int NOT NULL,
  `action` text NOT NULL,
  `resourcesUsed` text,
  `arrivalAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `responder_actions_reportId_risk_reports_id_fk` FOREIGN KEY (`reportId`) REFERENCES `risk_reports` (`id`),
  CONSTRAINT `responder_actions_responderId_users_id_fk` FOREIGN KEY (`responderId`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `settingKey` varchar(120) NOT NULL,
  `settingValue` text,
  `updatedBy` int,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `system_settings_settingKey_unique` (`settingKey`),
  CONSTRAINT `system_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `actorId` int,
  `action` varchar(120) NOT NULL,
  `entityType` varchar(80) NOT NULL,
  `entityId` int,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `activity_logs_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `report_exports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requestedBy` int,
  `reportType` varchar(80) NOT NULL,
  `fileKey` varchar(500),
  `fileUrl` varchar(1000),
  `status` enum('QUEUED','READY','FAILED') NOT NULL DEFAULT 'QUEUED',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `report_exports_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `role_change_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requesterId` int NOT NULL,
  `approverId` int,
  `userId` int NOT NULL,
  `fromRole` enum('user','admin','staff','responder','citizen') NOT NULL,
  `toRole` enum('user','admin','staff','responder','citizen') NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  `expiresAt` timestamp NOT NULL,
  `decidedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `role_change_requests_requesterId_users_id_fk` FOREIGN KEY (`requesterId`) REFERENCES `users` (`id`),
  CONSTRAINT `role_change_requests_approverId_users_id_fk` FOREIGN KEY (`approverId`) REFERENCES `users` (`id`),
  CONSTRAINT `role_change_requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `safety_advice` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slug` varchar(120) NOT NULL,
  `category` varchar(40) NOT NULL,
  `title` varchar(180) NOT NULL,
  `titleFilipino` varchar(180),
  `summary` text NOT NULL,
  `summaryFilipino` text,
  `body` text NOT NULL,
  `bodyFilipino` text,
  `status` enum('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `isEmergency` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0,
  `publishedAt` timestamp NULL,
  `archivedAt` timestamp NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `safety_advice_slug_unique` (`slug`),
  KEY `advice_status_idx` (`status`),
  KEY `advice_category_idx` (`category`),
  CONSTRAINT `safety_advice_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
);

-- Steps are a child table rather than a JSON column so they can be reordered,
-- validated and queried independently. Deleting advice cascades to its steps.
CREATE TABLE IF NOT EXISTS `advice_steps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `adviceId` int NOT NULL,
  `stepNo` int NOT NULL,
  `title` varchar(180),
  `titleFilipino` varchar(180),
  `instruction` text,
  `instructionFilipino` text,
  `imageUrl` varchar(1000),
  `imageKey` varchar(500),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `advice_step_order_idx` (`adviceId`,`stepNo`),
  CONSTRAINT `advice_steps_adviceId_safety_advice_id_fk` FOREIGN KEY (`adviceId`) REFERENCES `safety_advice` (`id`) ON DELETE cascade
);
