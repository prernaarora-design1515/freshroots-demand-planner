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
  // Where open purchase orders came from for this run: zoho | csv | zoho+csv | none | zoho_failed
  openPoSource: text("open_po_source").notNull().default("none"),
  openPoNote: text("open_po_note"),
  createdBy: text("created_by"),
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
  action: text("action").notNull(), // REORDER_NOW | REORDER | COVERED | PAUSE | REVIEW | NO_ACTION
  recommendedQty: integer("recommended_qty").notNull(), // net of open POs
  grossQty: integer("gross_qty").notNull().default(0), // what the rules asked for before netting
  openPoQty: integer("open_po_qty").notNull().default(0), // units already on open/draft POs
  onHand: integer("on_hand").notNull().default(0),
  unitCost: real("unit_cost"), // snapshot from sku_suppliers, for the results page
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
  decidedByUserId: integer("decided_by_user_id"),
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
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ---------- Open purchase orders (netted off the rules' quantities) ---------- */

/** Optional upload: open POs from outside Zoho (open_purchase_orders.csv). Replaced on each upload. */
export const openPosCsv = pgTable("open_pos_csv", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull(),
  skuId: text("sku_id").notNull(),
  openQty: integer("open_qty").notNull(),
  expectedDate: text("expected_date"),
  status: text("status"),
});

/** What each run saw as open, so a run can always be explained later. */
export const runOpenPos = pgTable("run_open_pos", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  skuId: text("sku_id").notNull(),
  source: text("source").notNull(), // zoho | csv
  poNumber: text("po_number").notNull(),
  status: text("status").notNull(),
  openQty: integer("open_qty").notNull(),
  expectedDate: text("expected_date"),
  vendor: text("vendor"),
});

/* ---------- Users ---------- */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(), // stored lower-case
  name: text("name").notNull(),
  role: text("role").notNull(), // admin | planner | viewer
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token; the token itself is never stored
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
