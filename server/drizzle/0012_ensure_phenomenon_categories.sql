ALTER TABLE "phenomena" ADD COLUMN IF NOT EXISTS "categories" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
UPDATE "phenomena" SET "categories" = ARRAY[category::text] WHERE cardinality("categories") = 0;
