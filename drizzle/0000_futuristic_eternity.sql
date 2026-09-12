CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "daily_program_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"programId" integer NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"article" varchar(64),
	"version" varchar(64),
	"bagQuantity" varchar(128),
	"bulkQuantity" varchar(128),
	"plannedStart" varchar(5) NOT NULL,
	"plannedEnd" varchar(5) NOT NULL,
	"observation" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"programDate" varchar(10) NOT NULL,
	"operatorName" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_operators" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"productionDate" varchar(10) NOT NULL,
	"article" varchar(64) NOT NULL,
	"totalProductionHours" numeric(10, 2) NOT NULL,
	"plannedStopsHours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"unplannedStopsHours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"productionTons" numeric(10, 2) NOT NULL,
	"wasteTons" numeric(10, 2) DEFAULT '0' NOT NULL,
	"standardRate" numeric(10, 2) NOT NULL,
	"availability" numeric(8, 6) NOT NULL,
	"performance" numeric(8, 6) NOT NULL,
	"quality" numeric(8, 6) NOT NULL,
	"trs" numeric(8, 6) NOT NULL,
	"realHours" numeric(10, 2) NOT NULL,
	"comment" text,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"actionPasswordHash" varchar(128),
	"actionPasswordSalt" varchar(64),
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synchronized_excel_files" (
	"id" integer PRIMARY KEY NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"downloadUrl" varchar(1024) NOT NULL,
	"recordCount" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE INDEX "daily_program_lines_program_sequence_index" ON "daily_program_lines" USING btree ("programId","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_programs_date_unique" ON "daily_programs" USING btree ("programDate");--> statement-breakpoint
CREATE UNIQUE INDEX "production_articles_code_unique" ON "production_articles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "production_operators_name_unique" ON "production_operators" USING btree ("name");