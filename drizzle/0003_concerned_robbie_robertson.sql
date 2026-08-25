CREATE TABLE `production_articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `production_articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `production_articles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `production_settings` (
	`id` int NOT NULL,
	`actionPasswordHash` varchar(128),
	`actionPasswordSalt` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `production_settings_id` PRIMARY KEY(`id`)
);
