CREATE TABLE "margin_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"minimum_margin_percent" numeric(5, 2) DEFAULT '15' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "sales_document_lines" ADD COLUMN "unit_cost_at_sale" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "sales_document_lines" ADD COLUMN "below_margin_band" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "margin_settings" ADD CONSTRAINT "margin_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;