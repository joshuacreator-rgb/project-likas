CREATE TABLE `role_change_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requesterId` int NOT NULL,
	`approverId` int,
	`userId` int NOT NULL,
	`fromRole` enum('user','admin','staff','responder','citizen') NOT NULL,
	`toRole` enum('user','admin','staff','responder','citizen') NOT NULL,
	`status` enum('PENDING','APPROVED','REJECTED','EXPIRED') NOT NULL DEFAULT 'PENDING',
	`expiresAt` timestamp NOT NULL,
	`decidedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_change_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `role_change_requests` ADD CONSTRAINT `role_change_requests_requesterId_users_id_fk` FOREIGN KEY (`requesterId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_change_requests` ADD CONSTRAINT `role_change_requests_approverId_users_id_fk` FOREIGN KEY (`approverId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_change_requests` ADD CONSTRAINT `role_change_requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;