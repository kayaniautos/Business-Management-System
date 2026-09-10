CREATE TYPE "public"."purchase_document_status" AS ENUM('draft', 'posted', 'unposted');--> statement-breakpoint
CREATE TYPE "public"."purchase_document_type" AS ENUM('purchase_order', 'goods_receipt', 'purchase_invoice');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'purchase';--> statement-breakpoint
CREATE TABLE "purchase_document_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"control_part_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"line_amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "purchase_document_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_document_id" uuid NOT NULL,
	"to_document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "purchase_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_type" "purchase_document_type" NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"supplier_ref" varchar(100),
	"document_date" date NOT NULL,
	"subtotal_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "purchase_document_status" DEFAULT 'draft' NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "purchase_document_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_purchase_document_id_purchase_documents_id_fk" FOREIGN KEY ("purchase_document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_control_part_id_control_parts_id_fk" FOREIGN KEY ("control_part_id") REFERENCES "public"."control_parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_links" ADD CONSTRAINT "purchase_document_links_from_document_id_purchase_documents_id_fk" FOREIGN KEY ("from_document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_links" ADD CONSTRAINT "purchase_document_links_to_document_id_purchase_documents_id_fk" FOREIGN KEY ("to_document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_links" ADD CONSTRAINT "purchase_document_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_links" ADD CONSTRAINT "purchase_document_links_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_document_links_from_to_unique" ON "purchase_document_links" USING btree ("from_document_id","to_document_id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_document_id_purchase_documents_id_fk" FOREIGN KEY ("purchase_document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE no action ON UPDATE no action;