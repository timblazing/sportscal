CREATE TABLE "calendar_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(32) NOT NULL,
	"edit_token_hash" varchar(64) NOT NULL,
	"league" varchar(16) NOT NULL,
	"team_id" varchar(16) NOT NULL,
	"team_slug" varchar(100) NOT NULL,
	"season_mode" varchar(8) DEFAULT 'auto' NOT NULL,
	"season_override" integer,
	"include_preseason" boolean DEFAULT false NOT NULL,
	"include_regular_season" boolean DEFAULT true NOT NULL,
	"include_postseason" boolean DEFAULT true NOT NULL,
	"calendar_name_template" text NOT NULL,
	"title_template" text NOT NULL,
	"description_template" text DEFAULT '' NOT NULL,
	"location_template" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"busy_status" varchar(8) DEFAULT 'free' NOT NULL,
	"include_espn_url" boolean DEFAULT false NOT NULL,
	"overrides_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_configs_public_id_idx" ON "calendar_configs" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "calendar_configs_team_slug_idx" ON "calendar_configs" USING btree ("team_slug");--> statement-breakpoint
CREATE INDEX "calendar_configs_league_idx" ON "calendar_configs" USING btree ("league");
