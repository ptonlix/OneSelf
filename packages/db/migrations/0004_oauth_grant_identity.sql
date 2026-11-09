ALTER TABLE "oauth_grants" ADD COLUMN "label" text;
--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD COLUMN "last_used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD COLUMN "refresh_expires_at" timestamp with time zone;
