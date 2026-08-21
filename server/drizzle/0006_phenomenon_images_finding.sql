CREATE TABLE "phenomenon_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phenomenon_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"image_alt" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phenomenon_images" ADD CONSTRAINT "phenomenon_images_phenomenon_id_phenomena_id_fk" FOREIGN KEY ("phenomenon_id") REFERENCES "public"."phenomena"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phenomena" ADD COLUMN "finding_hint" text;
