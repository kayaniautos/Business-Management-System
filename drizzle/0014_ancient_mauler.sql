CREATE TABLE "item_code_counters" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
-- item_code added nullable first, backfilled for any pre-existing rows,
-- then locked to NOT NULL UNIQUE — a plain "ADD COLUMN NOT NULL" would
-- fail outright against a table that already has rows (this app already
-- has real seeded/dev items), since Postgres has no value to put there.
ALTER TABLE "items" ADD COLUMN "item_code" varchar(20);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "part_no" varchar(100);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "brand" varchar(100);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "origin" varchar(100);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "item_class" varchar(100);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "engine_info" varchar(200);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "model" varchar(100);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "size" varchar(100);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "rpp" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "sap" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "safety_stock_days" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "print_name" varchar(300);--> statement-breakpoint
UPDATE "items" SET "item_code" = LPAD(sub.rn::text, 6, '0')
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at") AS rn FROM "items") AS sub
WHERE "items"."id" = sub."id" AND "items"."item_code" IS NULL;--> statement-breakpoint
INSERT INTO "item_code_counters" ("id", "last_number")
VALUES ('item', (SELECT COALESCE(MAX("item_code"::int), 0) FROM "items"))
ON CONFLICT ("id") DO UPDATE SET "last_number" = EXCLUDED."last_number";--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "item_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_item_code_unique" UNIQUE("item_code");