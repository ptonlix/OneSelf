CREATE TABLE "api_key_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"unrestricted_data" boolean NOT NULL,
	"site_write" boolean NOT NULL,
	"sources" jsonb NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"api_key_id" text,
	CONSTRAINT "api_key_requests_status" CHECK ("api_key_requests"."status" in ('pending', 'confirmed', 'expired')),
	CONSTRAINT "api_key_requests_sources_array" CHECK (jsonb_typeof("api_key_requests"."sources") = 'array')
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"label" text NOT NULL,
	"unrestricted_data" boolean NOT NULL,
	"site_write" boolean NOT NULL,
	"sources" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "api_keys_key_hash_format" CHECK ("api_keys"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "api_keys_sources_array" CHECK (jsonb_typeof("api_keys"."sources") = 'array')
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"source" text NOT NULL,
	"slug" text NOT NULL,
	"ordinal" integer NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "chunks_source_slug_ordinal_pk" PRIMARY KEY("source","slug","ordinal"),
	CONSTRAINT "chunks_ordinal" CHECK ("chunks"."ordinal" >= 0),
	CONSTRAINT "chunks_body_length" CHECK (char_length("chunks"."body") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"source" text NOT NULL,
	"slug" text NOT NULL,
	"id" text NOT NULL,
	"entity" text NOT NULL,
	"statement" text NOT NULL,
	"confidence" numeric,
	"valid_until" date,
	CONSTRAINT "facts_source_slug_id_pk" PRIMARY KEY("source","slug","id"),
	CONSTRAINT "facts_confidence" CHECK ("facts"."confidence" is null or ("facts"."confidence" >= 0 and "facts"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"page_source" text,
	"page_slug" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "files_object_key_format" CHECK ("files"."object_key" = 'files/' || "files"."id"),
	CONSTRAINT "files_media_type" CHECK ("files"."media_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf')),
	CONSTRAINT "files_byte_size" CHECK ("files"."byte_size" >= 0 and "files"."byte_size" <= 20971520),
	CONSTRAINT "files_sha256_format" CHECK ("files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "files_page_pair" CHECK (("files"."page_source" is null) = ("files"."page_slug" is null))
);
--> statement-breakpoint
CREATE TABLE "links" (
	"from_source" text NOT NULL,
	"from_slug" text NOT NULL,
	"to_source" text NOT NULL,
	"to_slug" text NOT NULL,
	CONSTRAINT "links_from_source_from_slug_to_source_to_slug_pk" PRIMARY KEY("from_source","from_slug","to_source","to_slug")
);
--> statement-breakpoint
CREATE TABLE "oauth_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"site_write" boolean NOT NULL,
	"sources" jsonb NOT NULL,
	"refresh_token_hash" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oauth_grants_sources_array" CHECK (jsonb_typeof("oauth_grants"."sources") = 'array'),
	CONSTRAINT "oauth_grants_refresh_token_hash_format" CHECK ("oauth_grants"."refresh_token_hash" is null or "oauth_grants"."refresh_token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" integer PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean NOT NULL,
	CONSTRAINT "owners_id" CHECK ("owners"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "page_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"slug" text NOT NULL,
	"content_hash" text NOT NULL,
	"object_key" text NOT NULL,
	"frontmatter" jsonb NOT NULL,
	"written_at" timestamp with time zone NOT NULL,
	CONSTRAINT "page_versions_content_hash_format" CHECK ("page_versions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "page_versions_object_key_format" CHECK ("page_versions"."object_key" = 'pages/' || "page_versions"."source" || '/' || "page_versions"."slug" || '/' || "page_versions"."content_hash" || '.md')
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"source" text NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"frontmatter" jsonb NOT NULL,
	"body" text NOT NULL,
	"content_hash" text NOT NULL,
	"object_key" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"hidden_by_source" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pages_source_slug_pk" PRIMARY KEY("source","slug"),
	CONSTRAINT "pages_slug_format" CHECK ("pages"."slug" ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
	CONSTRAINT "pages_type_format" CHECK ("pages"."type" ~ '^[a-z][a-z0-9-]{0,62}$'),
	CONSTRAINT "pages_visibility" CHECK ("pages"."visibility" in ('public', 'private')),
	CONSTRAINT "pages_content_hash_format" CHECK ("pages"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "pages_object_key_format" CHECK ("pages"."object_key" = 'pages/' || "pages"."source" || '/' || "pages"."slug" || '/' || "pages"."content_hash" || '.md')
);
--> statement-breakpoint
CREATE TABLE "site_activations" (
	"id" text PRIMARY KEY NOT NULL,
	"release_id" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "site_activations_release_id" CHECK ("site_activations"."release_id" = 'original' or "site_activations"."release_id" ~ '^rel_[0-9a-f]{32}$'),
	CONSTRAINT "site_activations_status" CHECK ("site_activations"."status" in ('pending', 'approved', 'rejected', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "site_files" (
	"release_id" text NOT NULL,
	"path" text NOT NULL,
	"object_key" text NOT NULL,
	CONSTRAINT "site_files_release_id_path_pk" PRIMARY KEY("release_id","path"),
	CONSTRAINT "site_files_path" CHECK ("site_files"."path" <> '' and "site_files"."path" !~ '^/' and "site_files"."path" !~ '(^|/)\.\.(/|$)'),
	CONSTRAINT "site_files_object_key_format" CHECK ("site_files"."object_key" = 'sites/' || "site_files"."release_id" || '/' || "site_files"."path")
);
--> statement-breakpoint
CREATE TABLE "site_pointers" (
	"id" integer PRIMARY KEY NOT NULL,
	"release_id" text NOT NULL,
	CONSTRAINT "site_pointers_id" CHECK ("site_pointers"."id" = 1),
	CONSTRAINT "site_pointers_release_id" CHECK ("site_pointers"."release_id" = 'original' or "site_pointers"."release_id" ~ '^rel_[0-9a-f]{32}$')
);
--> statement-breakpoint
CREATE TABLE "site_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "site_releases_id_format" CHECK ("site_releases"."id" ~ '^rel_[0-9a-f]{32}$')
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sources_id_format" CHECK ("sources"."id" ~ '^[a-z][a-z0-9-]{0,62}$')
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"source" text NOT NULL,
	"slug" text NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "tags_source_slug_tag_pk" PRIMARY KEY("source","slug","tag")
);
--> statement-breakpoint
CREATE TABLE "timeline_entries" (
	"source" text NOT NULL,
	"slug" text NOT NULL,
	"ordinal" integer NOT NULL,
	"occurred_on" date NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	CONSTRAINT "timeline_entries_source_slug_ordinal_pk" PRIMARY KEY("source","slug","ordinal"),
	CONSTRAINT "timeline_entries_ordinal" CHECK ("timeline_entries"."ordinal" >= 0)
);
--> statement-breakpoint
ALTER TABLE "api_key_requests" ADD CONSTRAINT "api_key_requests_api_key_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_page_fk" FOREIGN KEY ("source","slug") REFERENCES "public"."pages"("source","slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_page_fk" FOREIGN KEY ("source","slug") REFERENCES "public"."pages"("source","slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_page_fk" FOREIGN KEY ("page_source","page_slug") REFERENCES "public"."pages"("source","slug") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_from_page_fk" FOREIGN KEY ("from_source","from_slug") REFERENCES "public"."pages"("source","slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_fk" FOREIGN KEY ("source","slug") REFERENCES "public"."pages"("source","slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_source_fk" FOREIGN KEY ("source") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_files" ADD CONSTRAINT "site_files_release_fk" FOREIGN KEY ("release_id") REFERENCES "public"."site_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_page_fk" FOREIGN KEY ("source","slug") REFERENCES "public"."pages"("source","slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_page_fk" FOREIGN KEY ("source","slug") REFERENCES "public"."pages"("source","slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pages_source_type_idx" ON "pages" USING btree ("source","type");--> statement-breakpoint
CREATE INDEX "pages_frontmatter_idx" ON "pages" USING gin ("frontmatter");--> statement-breakpoint
CREATE INDEX "pages_title_body_search_idx" ON "pages" USING gin (to_tsvector('simple', "title" || ' ' || "body"));