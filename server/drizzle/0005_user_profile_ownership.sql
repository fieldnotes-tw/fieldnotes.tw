ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "phenomena" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "phenomena" ADD CONSTRAINT "phenomena_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "phenomenon_tracks" (
	"user_id" uuid NOT NULL,
	"phenomenon_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phenomenon_tracks_user_id_phenomenon_id_pk" PRIMARY KEY("user_id","phenomenon_id")
);
--> statement-breakpoint
ALTER TABLE "phenomenon_tracks" ADD CONSTRAINT "phenomenon_tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phenomenon_tracks" ADD CONSTRAINT "phenomenon_tracks_phenomenon_id_phenomena_id_fk" FOREIGN KEY ("phenomenon_id") REFERENCES "public"."phenomena"("id") ON DELETE cascade ON UPDATE no action;
