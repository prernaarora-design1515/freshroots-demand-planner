import {
  pgTable,
  text,
  integer,
  boolean,
  date,
  real,
  serial,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ---------- Seed data (mirrors the SAP CSV export) ---------- */

export const distributors = pgTable("distributors", {
  distributorId: text("distributor_id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  status: text("status").notNull(),
});

export const skus = pgTable("skus", {
  skuId: text("sku_id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  perishability: text("perishability").notNull(), // "Low" | "High"
  standardReorderQty: integer("standard_reorder_qty").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull(),
  distributorId: text("distributor_id").notNull(),
});

export const weeklySales = pgTable(
  "weekly_sales",
  {
    skuId: text("sku_id").notNull(),
    week: text("week").notNull(), // ISO week, e.g. 2026-W42
    unitsSold: integer("units_sold").notNull(),
  },
  (t) => [primaryKey({ columns: [t.skuId, t.week] })],
);

export const inventory = pgTable(
  "inventory",
  {
    skuId: text("sku_id").notNull(),
    location: text("location").notNull(),
    unitsOnHand: integer("units_on_hand").notNull(),
    asOfDate: date("as_of_date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.skuId, t.location] })],
);

export const calendar = pgTable("calendar", {
  yearMonth: text("year_month").primaryKey(), // 2026-10
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  isFestivalMonth: boolean("is_festival_month").notNull(),
});

/* ---------- Created by the app ---------- */

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  asOfDate: date("as_of_date").notNull(),
  latestWeek: text("latest_week").notNull(),
  isFestival: boolean("is_festival").notNull(),
  skuCount: integer("sku_count").notNull(),
  flaggedCount: integer("flagged_count").notNull(),
  aiStatus: text("ai_status").notNull().default("pending"), // pending | ok | failed | skipped
});

export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  skuId: text("sku_id").notNull(),
  avg4: real("avg4").notNull(),
  avg12: real("avg12").notNull(),
  demandLiftPct: real("demand_lift_pct").notNull(),
  expectedWeeklyDemand: real("expected_weekly_demand").notNull(),
  weeksOfCover: real("weeks_of_cover").notNull(),
  minWeeks: real("min_weeks").notNull(),
  maxWeeks: real("max_weeks").notNull(),
  flags: text("flags").notNull(), // comma-separated: HIGH_DEMAND,STOCKOUT_RISK,OVERSTOCK_RISK
  action: text("action").notNull(), // REORDER_NOW | REORDER | PAUSE | REVIEW | NO_ACTION
  recommendedQty: integer("recommended_qty").notNull(),
  borderline: text("borderline"), // deterministic note on near-threshold cases
  needsJudgment: boolean("needs_judgment").notNull().default(false),
  ruleSummary: text("rule_summary").notNull(), // template explanation, always present
  aiExplanation: text("ai_explanation"), // Gemini text, may be null
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  recommendationId: integer("recommendation_id").notNull().unique(),
  status: text("status").notNull(), // APPROVED | OVERRIDDEN | REJECTED
  finalQty: integer("final_qty").notNull(),
  reasonCode: text("reason_code"),
  note: text("note"),
  decidedBy: text("decided_by").notNull().default("Raghav"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
  // Set once the line is sent to Zoho; the decision is then locked.
  zohoPoId: text("zoho_po_id"),
  zohoPoNumber: text("zoho_po_number"),
});

/* ---------- Supplier mapping (who Freshroots buys each SKU from) ---------- */

export const skuSuppliers = pgTable("sku_suppliers", {
  skuId: text("sku_id").primaryKey(),
  supplierId: text("supplier_id").notNull(),
  supplierName: text("supplier_name").notNull(),
  unitCost: real("unit_cost").notNull(), // INR per unit
  leadTimeDays: integer("lead_time_days").notNull(),
});

/* ---------- Zoho Inventory integration ---------- */

export const zohoConnection = pgTable("zoho_connection", {
  id: integer("id").primaryKey(), // always 1: one connected Zoho organization
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  accountsUrl: text("accounts_url").notNull(),
  apiBase: text("api_base").notNull(),
  orgId: text("org_id").notNull(),
  orgName: text("org_name").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Local ID -> Zoho ID, for vendors (supplier_id) and items (sku_id). */
export const zohoMap = pgTable(
  "zoho_map",
  {
    kind: text("kind").notNull(), // "vendor" | "item"
    localId: text("local_id").notNull(),
    zohoId: text("zoho_id").notNull(),
    orgId: text("org_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.localId, t.orgId] })],
);

export const zohoPushes = pgTable("zoho_pushes", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  supplierName: text("supplier_name").notNull(),
  poId: text("po_id"),
  poNumber: text("po_number"),
  lineCount: integer("line_count").notNull(),
  totalQty: integer("total_qty").notNull(),
  status: text("status").notNull(), // created | failed
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
