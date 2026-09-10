ALTER TYPE "public"."stock_movement_type" ADD VALUE 'sale';--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "reason_comment" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "sales_document_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sales_document_id_sales_documents_id_fk" FOREIGN KEY ("sales_document_id") REFERENCES "public"."sales_documents"("id") ON DELETE no action ON UPDATE no action;