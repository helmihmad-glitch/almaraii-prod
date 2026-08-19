CREATE TABLE `synchronized_excel_files` (
	`id` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`downloadUrl` varchar(1024) NOT NULL,
	`recordCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `synchronized_excel_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `production_records` ADD `source` varchar(16) DEFAULT 'manual' NOT NULL;