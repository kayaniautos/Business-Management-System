CREATE TABLE "stock_cost_layers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"control_part_id" uuid NOT NULL,
	"purchase_document_id" uuid NOT NULL,
	"quantity_received" integer NOT NULL,
	"quantity_remaining" integer NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_layer_consumptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cost_layer_id" uuid NOT NULL,
	"stock_movement_id" uuid NOT NULL,
	"quantity_consumed" integer NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "stock_cost_layers" ADD CONSTRAINT "stock_cost_layers_control_part_id_control_parts_id_fk" FOREIGN KEY ("control_part_id") REFERENCES "public"."control_parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_cost_layers" ADD CONSTRAINT "stock_cost_layers_purchase_document_id_purchase_documents_id_fk" FOREIGN KEY ("purchase_document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_cost_layers" ADD CONSTRAINT "stock_cost_layers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_cost_layers" ADD CONSTRAINT "stock_cost_layers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_layer_consumptions" ADD CONSTRAINT "stock_layer_consumptions_cost_layer_id_stock_cost_layers_id_fk" FOREIGN KEY ("cost_layer_id") REFERENCES "public"."stock_cost_layers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_layer_consumptions" ADD CONSTRAINT "stock_layer_consumptions_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_layer_consumptions" ADD CONSTRAINT "stock_layer_consumptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_layer_consumptions" ADD CONSTRAINT "stock_layer_consumptions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;