# Freshroots Demand Planner

MESA Term 2 · Case 1, Option A. Raghav's documented reorder rules run twice a week on the SAP export. Gemini explains each flag, and Raghav approves or overrides every line before procurement sees it.

**Stack:** Next.js 15 (App Router, TypeScript) · Neon Postgres + Drizzle ORM · Gemini via Vercel AI SDK · Tailwind · Vitest · GitHub → Vercel

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
                         Approved reorder list (CSV) for procurement  ·  decisions logged for the 90-day plan
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
| POST | `/api/upload` | multipart form with any of `weekly_sales`, `sku_master`, `distributor_master`, `current_inventory`, `calendar`. Each file uploaded replaces its table |
| GET / POST | `/api/runs` | list runs / run the rules (+ Gemini) on the current data |
| POST / DELETE | `/api/decisions` | approve, override (`finalQty` + `reasonCode`), or reject a recommendation / undo |
| POST | `/api/sample` | load the bundled seed CSVs and run the rules |
| GET | `/api/runs/:id/export` | CSV of approved orders and approved pauses |

## Database (8 tables)

- **Seed data:** `skus`, `distributors`, `weekly_sales`, `inventory`, `calendar`
- **Created by the app:**
  - `runs`: one row per run
  - `recommendations`: per SKU per run: averages, cover, flags, action, qty, borderline, rule summary, AI explanation
  - `decisions`: Raghav's approval or override, with a reason code. This feeds the override-rate metric.

## Future state (not in this demo)

- A Vercel Cron for the Mon/Thu 6 am run, fed by an automated SAP export
- Pushing approved lines into Zoho Inventory as draft POs
- Netting off open POs
- AI anomaly detection, once 3 years of history is loaded
