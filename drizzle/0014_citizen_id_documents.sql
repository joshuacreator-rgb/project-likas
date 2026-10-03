CREATE TABLE `citizen_id_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileName` varchar(255),
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int,
	`idType` varchar(40),
	`idNumberMasked` varchar(40),
	`addressOnId` text,
	`status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`rejectionReason` varchar(60),
	`rejectionNote` text,
	`centerId` int,
	`purgeAfter` timestamp,
	`purgedAt` timestamp,
	`supersedesId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `citizen_id_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `deactivatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `citizen_id_documents` ADD CONSTRAINT `citizen_id_documents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `citizen_id_documents` ADD CONSTRAINT `citizen_id_documents_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `citizen_id_documents` ADD CONSTRAINT `citizen_id_documents_centerId_evacuation_centers_id_fk` FOREIGN KEY (`centerId`) REFERENCES `evacuation_centers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `id_document_status_idx` ON `citizen_id_documents` (`status`);--> statement-breakpoint
CREATE INDEX `id_document_purge_idx` ON `citizen_id_documents` (`purgeAfter`);--> statement-breakpoint
CREATE INDEX `id_document_user_idx` ON `citizen_id_documents` (`userId`);