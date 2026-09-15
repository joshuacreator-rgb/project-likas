CREATE TABLE `report_exports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestedBy` int,
	`reportType` varchar(80) NOT NULL,
	`fileKey` varchar(500),
	`fileUrl` varchar(1000),
	`status` enum('QUEUED','READY','FAILED') NOT NULL DEFAULT 'QUEUED',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `report_exports_id` PRIMARY KEY(`id`)
);
