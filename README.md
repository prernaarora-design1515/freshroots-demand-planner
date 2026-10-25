# Freshroots Demand Planner

MESA Term 2 · Case 1, Option A. Raghav's documented reorder rules run on the SAP export. Gemini explains each flag, Raghav approves or overrides every line, and approved lines go to Zoho Inventory as draft purchase orders.

**Live app:** https://freshroots-demand-planner-eight.vercel.app

**Stack:** Next.js 15 (App Router, TypeScript) · Neon Postgres + Drizzle ORM · Gemini Flash-Lite via Vercel AI SDK · Zoho Inventory API (OAuth) · Tailwind · Vitest · GitHub → Vercel

## How it works

```
CSV upload (SAP export) ──► Neon tables ──► Rules engine (src/lib/rules.ts, no AI)
                                                │  numbers, flags, qty, borderline notes
                                                ▼
                                   Gemini (src/lib/explain.ts): plain-English "why" only
                                                │  (optional: failures fall back to rule summary)
                                                ▼
                     Planner dashboard (/) ──► Raghav approves / overrides / rejects + reason code
                                                ▼
              Zoho Inventory: one DRAFT purchase order per supplier (procurement issues it)
                         + CSV export as fallback  ·  decisions logged for the 90-day plan
```

### Rules (as agreed)

| Rule | Low perishability | High perishability |
|---|---|---|
| High demand | last-4-wk avg > 20% above 12-wk avg → reorder 1.5× standard qty | same |
| Stockout risk | < 6 weeks of cover → reorder now | < 3 weeks |
| Overstock risk | > 14 weeks of cover → pause next order | > 4 weeks |
| Festival (Oct, Nov, Mar) | expected weekly demand × 1.25 before cover checks | same |

- The 12-week average includes the latest 4 weeks.
- The festival uplift only affects the weeks-of-cover checks. Festival status comes from the month of the inventory as-of date, looked up in `calendar.csv`.
- **Priority when flags combine:**
  - stockout + high demand → reorder now at 1.5×
  - stockout only → reorder now at the standard qty
  - overstock + high demand → **REVIEW** (planner decides)
  - overstock only → pause
  - high demand only → reorder at 1.5×
- Fewer than 12 weeks of history → **REVIEW** (treated as a new launch).
- **Borderline:** a value within 10% of a threshold, or a flag that only exists because of the festival uplift. Borderline notes are calculated in code; Gemini only rephrases them.
- **Known gap:** open POs aren't in the data, so recommendations are gross, not net of stock already on order.

Seed-data result (19 Oct 2026, festival month): 7 of 15 SKUs flagged.

- Reorder now: SKU001 750 · SKU003 300 · SKU004 150 · SKU011 500 · SKU013 120
- Pause: SKU006 · SKU007 (borderline)

These outcomes are asserted in `src/lib/rules.test.ts`.

## Run locally (no Neon needed)

```bash
npm install
cp .env.example .env        # keeps DATABASE_URL=pglite:./.pglite (embedded Postgres)
npm run db:migrate
npm run db:seed             # loads data/*.csv and creates run #1
npm run dev                 # http://localhost:3000
npm test                    # rules engine tests
```

## Deploy (Neon + Vercel)

1. Deploy the repo to Vercel. The `vercel-build` script runs the database migrations first. If `DATABASE_URL` isn't set yet it skips them, so the first deploy still succeeds and the site shows a setup page.
2. In the Vercel project:
   - **Storage** → connect a Neon database. This sets `DATABASE_URL`; you can also add it by hand.
   - **Settings → Environment Variables** → add `GEMINI_API_KEY` (optional: `GEMINI_MODEL`, default `gemini-flash-latest`).
3. Redeploy. The build creates the tables.
4. Open the site and click **Load sample data**, or upload your own CSVs.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/upload` | multipart form with any of `weekly_sales`, `sku_master`, `distributor_master`, `current_inventory`, `calendar`, `sku_suppliers`. Each file uploaded replaces its table |
| GET / POST | `/api/runs` | list runs / run the rules (+ Gemini) on the current data |
| POST / DELETE | `/api/decisions` | approve, override (`finalQty` + `reasonCode`), or reject a recommendation / undo |
| POST | `/api/sample` | load the bundled seed CSVs and run the rules |
| GET | `/api/runs/:id/export` | CSV of approved orders and approved pauses (with supplier and Zoho PO number) |
| GET | `/api/zoho/connect`, `/api/zoho/callback` | Zoho OAuth connect flow (state cookie checked; only Zoho domains trusted) |
| POST | `/api/zoho/sync` | create or link suppliers as Zoho vendors and SKUs as Zoho items |
| POST | `/api/zoho/push` | send a run's approved lines to Zoho as draft POs, one per supplier |
| POST | `/api/zoho/disconnect` | revoke and forget the Zoho connection |

## Database (12 tables)

- **Seed data:** `skus`, `distributors`, `weekly_sales`, `inventory`, `calendar`, `sku_suppliers`
- **Created by the app:**
  - `runs`: one row per run
  - `recommendations`: per SKU per run: averages, cover, flags, action, qty, borderline, rule summary, AI explanation
  - `decisions`: Raghav's approval or override, with a reason code and, once sent, the Zoho PO number (sent lines are locked). This feeds the override-rate metric.
  - `zoho_connection`, `zoho_map`, `zoho_pushes`: the Zoho OAuth connection, local-to-Zoho ID mapping, and send history

## Zoho Inventory setup

1. Create a Zoho Inventory organization (India data centre: inventory.zoho.in).
2. In api-console.zoho.in create a **Server-based Application** with redirect URI `https://<your-app>/api/zoho/callback`.
3. Add `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` to Vercel (Production), redeploy.
4. In the app: **Zoho → Connect Zoho**, then **Sync suppliers & items**, then **Send approved to Zoho** on the dashboard.

`sku_suppliers.csv` (supplier, unit cost, lead time per SKU) is **fictional demo data**: the case does not name Freshroots' suppliers.

## Known gaps / future state

- The twice-weekly run is manual (upload + Re-run). Next: Vercel Cron Mon/Thu 6 am fed by an automated SAP export.
- Open POs are not netted off yet. Next: read open POs from Zoho before recommending (the app already has read access).
- No 90-day results page yet (override rate, stockouts, write-offs); decisions are logged and ready for it.
- AI anomaly detection, once 3 years of history is loaded.
- Single-user: decisions are recorded as "Raghav"; access relies on Vercel deployment protection.
