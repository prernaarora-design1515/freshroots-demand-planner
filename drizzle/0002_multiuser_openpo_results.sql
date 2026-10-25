CREATE TABLE "open_pos_csv" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"sku_id" text NOT NULL,
	"open_qty" integer NOT NULL,
	"expected_date" text,
	"status" text
);
--> statement-breakpoint
CREATE TABLE "run_open_pos" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"sku_id" text NOT NULL,
	"source" text NOT NULL,
	"po_number" text NOT NULL,
	"status" text NOT NULL,
	"open_qty" integer NOT NULL,
	"expected_date" text,
	"vendor" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "decided_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "gross_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "open_po_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "on_hand" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "unit_cost" real;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "open_po_source" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "open_po_note" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "zoho_pushes" ADD COLUMN "created_by" text;--> statement-breakpoint
-- Backfill older runs so the results page can use them.
UPDATE "recommendations" SET "gross_qty" = "recommended_qty" WHERE "gross_qty" = 0;--> statement-breakpoint
UPDATE "recommendations" SET "on_hand" = ROUND("weeks_of_cover" * "expected_weekly_demand") WHERE "on_hand" = 0 AND "weeks_of_cover" < 999;--> statement-breakpoint
UPDATE "recommendations" r SET "unit_cost" = s."unit_cost" FROM "sku_suppliers" s WHERE r."sku_id" = s."sku_id" AND r."unit_cost" IS NULL;
