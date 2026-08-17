CREATE TYPE "public"."sighting_condition" AS ENUM('abundant', 'fewer', 'gone', 'unsure');--> statement-breakpoint
CREATE TABLE "sightings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phenomenon_id" uuid NOT NULL,
	"user_id" uuid,
	"observer_name" text,
	"seen_at" timestamp with time zone NOT NULL,
	"condition" "sighting_condition",
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sighting_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sighting_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"image_alt" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_phenomenon_id_phenomena_id_fk" FOREIGN KEY ("phenomenon_id") REFERENCES "public"."phenomena"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sighting_images" ADD CONSTRAINT "sighting_images_sighting_id_sightings_id_fk" FOREIGN KEY ("sighting_id") REFERENCES "public"."sightings"("id") ON DELETE cascade ON UPDATE no action;
