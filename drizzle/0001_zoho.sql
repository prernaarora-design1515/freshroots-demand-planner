CREATE TABLE "sku_suppliers" (
	"sku_id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"unit_cost" real NOT NULL,
	"lead_time_days" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_connection" (
	"id" integer PRIMARY KEY NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"access_expires_at" timestamp with time zone,
	"accounts_url" text NOT NULL,
	"api_base" text NOT NULL,
	"org_id" text NOT NULL,
	"org_name" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_map" (
	"kind" text NOT NULL,
	"local_id" text NOT NULL,
	"zoho_id" text NOT NULL,
	"org_id" text NOT NULL,
	CONSTRAINT "zoho_map_kind_local_id_org_id_pk" PRIMARY KEY("kind","local_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "zoho_pushes" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"supplier_name" text NOT NULL,
	"po_id" text,
	"po_number" text,
	"line_count" integer NOT NULL,
	"total_qty" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "zoho_po_id" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "zoho_po_number" text;