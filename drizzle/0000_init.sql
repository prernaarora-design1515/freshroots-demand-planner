CREATE TABLE "calendar" (
	"year_month" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"is_festival_month" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"recommendation_id" integer NOT NULL,
	"status" text NOT NULL,
	"final_qty" integer NOT NULL,
	"reason_code" text,
	"note" text,
	"decided_by" text DEFAULT 'Raghav' NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_recommendation_id_unique" UNIQUE("recommendation_id")
);
--> statement-breakpoint
CREATE TABLE "distributors" (
	"distributor_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"sku_id" text NOT NULL,
	"location" text NOT NULL,
	"units_on_hand" integer NOT NULL,
	"as_of_date" date NOT NULL,
	CONSTRAINT "inventory_sku_id_location_pk" PRIMARY KEY("sku_id","location")
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"sku_id" text NOT NULL,
	"avg4" real NOT NULL,
	"avg12" real NOT NULL,
	"demand_lift_pct" real NOT NULL,
	"expected_weekly_demand" real NOT NULL,
	"weeks_of_cover" real NOT NULL,
	"min_weeks" real NOT NULL,
	"max_weeks" real NOT NULL,
	"flags" text NOT NULL,
	"action" text NOT NULL,
	"recommended_qty" integer NOT NULL,
	"borderline" text,
	"needs_judgment" boolean DEFAULT false NOT NULL,
	"rule_summary" text NOT NULL,
	"ai_explanation" text
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"as_of_date" date NOT NULL,
	"latest_week" text NOT NULL,
	"is_festival" boolean NOT NULL,
	"sku_count" integer NOT NULL,
	"flagged_count" integer NOT NULL,
	"ai_status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"sku_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"perishability" text NOT NULL,
	"standard_reorder_qty" integer NOT NULL,
	"unit_of_measure" text NOT NULL,
	"distributor_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_sales" (
	"sku_id" text NOT NULL,
	"week" text NOT NULL,
	"units_sold" integer NOT NULL,
	CONSTRAINT "weekly_sales_sku_id_week_pk" PRIMARY KEY("sku_id","week")
);
