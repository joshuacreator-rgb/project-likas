ALTER TABLE `auth_credentials` ADD `emailVerificationTokenHash` varchar(255);--> statement-breakpoint
ALTER TABLE `auth_credentials` ADD `emailVerificationExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;