CREATE TABLE "deal_part_components" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_part_id" uuid NOT NULL,
	"control_part_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "deal_parts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"print_name" varchar(200) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "sales_document_lines" ALTER COLUMN "control_part_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_document_lines" ADD COLUMN "deal_part_id" uuid;--> statement-breakpoint
ALTER TABLE "deal_part_components" ADD CONSTRAINT "deal_part_components_deal_part_id_deal_parts_id_fk" FOREIGN KEY ("deal_part_id") REFERENCES "public"."deal_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_part_components" ADD CONSTRAINT "deal_part_components_control_part_id_control_parts_id_fk" FOREIGN KEY ("control_part_id") REFERENCES "public"."control_parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_part_components" ADD CONSTRAINT "deal_part_components_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_part_components" ADD CONSTRAINT "deal_part_components_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_parts" ADD CONSTRAINT "deal_parts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_parts" ADD CONSTRAINT "deal_parts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_deal_part_id_deal_parts_id_fk" FOREIGN KEY ("deal_part_id") REFERENCES "public"."deal_parts"("id") ON DELETE no action ON UPDATE no action;