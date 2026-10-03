CREATE TABLE `advice_steps` (
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
	CONSTRAINT `advice_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `safety_advice` (
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
	`publishedAt` timestamp,
	`archivedAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `safety_advice_id` PRIMARY KEY(`id`),
	CONSTRAINT `safety_advice_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `advice_steps` ADD CONSTRAINT `advice_steps_adviceId_safety_advice_id_fk` FOREIGN KEY (`adviceId`) REFERENCES `safety_advice`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `safety_advice` ADD CONSTRAINT `safety_advice_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `advice_step_order_idx` ON `advice_steps` (`adviceId`,`stepNo`);--> statement-breakpoint
CREATE INDEX `advice_status_idx` ON `safety_advice` (`status`);--> statement-breakpoint
CREATE INDEX `advice_category_idx` ON `safety_advice` (`category`);