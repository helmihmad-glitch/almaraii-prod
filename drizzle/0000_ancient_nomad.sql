CREATE TABLE `production_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productionDate` varchar(10) NOT NULL,
	`article` varchar(64) NOT NULL,
	`totalProductionHours` decimal(10,2) NOT NULL,
	`plannedStopsHours` decimal(10,2) NOT NULL DEFAULT '0',
	`unplannedStopsHours` decimal(10,2) NOT NULL DEFAULT '0',
	`productionTons` decimal(10,2) NOT NULL,
	`wasteTons` decimal(10,2) NOT NULL DEFAULT '0',
	`standardRate` decimal(10,2) NOT NULL,
	`availability` decimal(8,6) NOT NULL,
	`performance` decimal(8,6) NOT NULL,
	`quality` decimal(8,6) NOT NULL,
	`trs` decimal(8,6) NOT NULL,
	`realHours` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `production_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
