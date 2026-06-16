ALTER TABLE "transactions" ADD COLUMN "location_latitude" double precision;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "location_longitude" double precision;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "location_source" varchar(20);