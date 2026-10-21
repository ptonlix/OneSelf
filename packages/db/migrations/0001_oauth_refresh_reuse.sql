ALTER TABLE "oauth_grants" ADD COLUMN "rotated_refresh_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD COLUMN "refresh_token_payload" jsonb;--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_rotated_refresh_hashes_array" CHECK (jsonb_typeof("rotated_refresh_hashes") = 'array');
