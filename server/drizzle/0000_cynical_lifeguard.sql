CREATE TYPE "public"."phenomenon_category" AS ENUM('animal', 'plant', 'taste');--> statement-breakpoint
CREATE TYPE "public"."phenomenon_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TABLE "phenomena" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "phenomenon_status" DEFAULT 'active' NOT NULL,
	"category" "phenomenon_category" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"location" text,
	"notes" text,
	"lat" double precision,
	"lng" double precision,
	"image_url" text,
	"image_alt" text,
	"observer_name" text,
	"meta_label" text,
	"last_noticed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
