CREATE TABLE `daily_program_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`programId` int NOT NULL,
	`sequence` int NOT NULL DEFAULT 1,
	`article` varchar(64),
	`version` varchar(64),
	`bagQuantity` varchar(128),
	`bulkQuantity` varchar(128),
	`plannedStart` varchar(5) NOT NULL,
	`plannedEnd` varchar(5) NOT NULL,
	`observation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_program_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_programs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`programDate` varchar(10) NOT NULL,
	`operatorName` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_programs_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_programs_date_unique` UNIQUE(`programDate`)
);
--> statement-breakpoint
CREATE INDEX `daily_program_lines_program_sequence_index` ON `daily_program_lines` (`programId`,`sequence`);