CREATE TABLE "silo_production_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"entryId" integer NOT NULL,
	"silo" varchar(16) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_production_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"entryDate" varchar(10),
	"article" varchar(64) NOT NULL,
	"lotNumber" varchar(64),
	"totalQuantity" numeric(10, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipmentDate" varchar(10),
	"article" varchar(64) NOT NULL,
	"lotNumber" varchar(64),
	"quantity" numeric(10, 2) NOT NULL,
	"silo" varchar(16) NOT NULL,
	"shipmentType" varchar(8) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "silo_production_allocations_entry_index" ON "silo_production_allocations" USING btree ("entryId","silo");--> statement-breakpoint
CREATE INDEX "silo_production_entries_date_index" ON "silo_production_entries" USING btree ("entryDate");--> statement-breakpoint
CREATE INDEX "silo_shipments_date_index" ON "silo_shipments" USING btree ("shipmentDate");