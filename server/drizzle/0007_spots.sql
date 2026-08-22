CREATE TYPE "public"."spot_kind" AS ENUM('fixed', 'area');--> statement-breakpoint
CREATE TABLE "spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phenomenon_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location_detail" text,
	"kind" "spot_kind" DEFAULT 'fixed' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"finding_hint" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_phenomenon_id_phenomena_id_fk" FOREIGN KEY ("phenomenon_id") REFERENCES "public"."phenomena"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "spots_phenomenon_id_idx" ON "spots" USING btree ("phenomenon_id");
--> statement-breakpoint
INSERT INTO "spots" (
	"phenomenon_id",
	"name",
	"location_detail",
	"kind",
	"lat",
	"lng",
	"finding_hint",
	"sort_order",
	"created_at",
	"updated_at"
)
SELECT
	p."id",
	COALESCE(
		NULLIF(trim(split_part(replace(p."location", '｜', '·'), '·', 1)), ''),
		NULLIF(trim(p."location"), ''),
		'主要地點'
	),
	CASE
		WHEN position('·' in replace(p."location", '｜', '·')) > 0 THEN
			NULLIF(trim(substring(replace(p."location", '｜', '·') from position('·' in replace(p."location", '｜', '·')) + 1)), '')
		ELSE NULL
	END,
	'fixed',
	p."lat",
	p."lng",
	p."finding_hint",
	0,
	p."created_at",
	p."updated_at"
FROM "phenomena" p;
--> statement-breakpoint
ALTER TABLE "sightings" ADD COLUMN "spot_id" uuid;
--> statement-breakpoint
UPDATE "sightings" s
SET "spot_id" = sp."id"
FROM "spots" sp
WHERE sp."phenomenon_id" = s."phenomenon_id"
	AND sp."sort_order" = 0;
--> statement-breakpoint
ALTER TABLE "sightings" ALTER COLUMN "spot_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;
