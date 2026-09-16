ALTER TABLE "production_settings" ADD COLUMN "adminUsername" varchar(64);--> statement-breakpoint
ALTER TABLE "production_settings" ADD COLUMN "adminPasswordHash" varchar(128);--> statement-breakpoint
ALTER TABLE "production_settings" ADD COLUMN "adminPasswordSalt" varchar(64);