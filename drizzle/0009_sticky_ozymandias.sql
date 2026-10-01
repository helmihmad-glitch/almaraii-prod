CREATE TABLE "rest_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"restDate" varchar(10) NOT NULL,
	"source" varchar(16) DEFAULT 'excel-import' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rest_days_date_unique" ON "rest_days" USING btree ("restDate");