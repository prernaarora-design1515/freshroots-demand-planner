# Freshroots Demand Planner

MESA Term 2 · Case 1, Option A. Raghav's documented reorder rules run on the SAP export. Open purchase orders from Zoho are netted off, Gemini explains each flag, a planner approves or overrides every line, and approved lines go to Zoho Inventory as draft purchase orders. A results page tracks the 90-day measurement plan.

**Live app:** https://freshroots-demand-planner-eight.vercel.app

**Stack:** Next.js 15 (App Router, TypeScript) · Neon Postgres + Drizzle ORM · Gemini Flash-Lite via Vercel AI SDK · Zoho Inventory API (OAuth) · scrypt sessions (no auth vendor) · Tailwind · Vitest · GitHub → Vercel

## How it works

```
CSV upload (SAP export) ──► Neon tables ──► Rules engine (src/lib/rules.ts, no AI)
Zoho open/draft POs (+ optional CSV) ─────────►  │  numbers, flags, qty − open POs, borderline notes
                                                ▼
                                   Gemini (src/lib/explain.ts): plain-English "why" only
                                                │  (optional: failures fall back to rule summary)
                                                ▼
          Planner dashboard (/) ──► signed-in planner approves / overrides / rejects + reason code
                                                ▼
              Zoho Inventory: one DRAFT purchase order per supplier (procurement issues it)
                         + CSV export as fallback  ·  decisions logged ──► 90-day results (/results)
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
- **Open POs are netted off the order quantity.** Each run reads every Zoho PO that can still deliver stock (drafts, issued, partially received; cancelled/closed/received are ignored) and counts the undelivered quantity per SKU, plus any `open_purchase_orders.csv` you upload for POs outside Zoho (a PO number in both counts once).
  - Order = max(0, rules qty − open PO qty). If open POs already cover it, the action is **COVERED** (nothing new to order; the planner confirms).
  - The flags still use stock on hand, as Raghav's rules say: an open PO doesn't put stock on the shelf until it arrives. The dashboard also shows cover once open POs arrive.
  - Overstocked SKUs with open POs get a note to consider delaying them.
  - Each run stores the open PO lines it saw (`run_open_pos`), so every number can be explained later.

Seed-data result (19 Oct 2026, festival month): 7 of 15 SKUs flagged.

- Reorder now: SKU001 750 · SKU003 300 · SKU004 150 · SKU011 500 · SKU013 120
- Pause: SKU006 · SKU007 (borderline)

These outcomes are asserted in `src/lib/rules.test.ts`.

## Users and roles

| Role | Can |
|---|---|
| Signed out | View dashboard, 90-day results and Zoho status (read-only). Set `REQUIRE_LOGIN_TO_VIEW=true` to hide everything behind sign-in |
| Viewer | The above, plus download the approved list |
| Planner | Upload data, run the rules, approve / override / reject, send to Zoho |
| Admin | Everything, plus the Users page and connecting / syncing / disconnecting Zoho |

- **First admin:** add `SETUP_CODE` (any secret phrase, 8+ characters) in Vercel, redeploy, open `/setup` and enter it with your name, email and password. `/setup` closes as soon as one user exists.
- The admin adds people on **Users** with a temporary password; they change it under their name.
- Every decision records who made it. If two planners act on the same line, the first decision stands until someone clicks Undo.
- Passwords: scrypt with a random salt. Sessions: random token in an httpOnly cookie (14 days), only its hash stored. 5 wrong passwords lock the account for 15 minutes. Cross-site POSTs are rejected. Role changes, deactivation and password resets sign the user out.

## 90-day results (/results)

Day 1 is the first run. Each metric shows the before (from Deepa's brief), the target and on track / off track:

| Metric | Before | Target |
|---|---|---|
| Planning cadence | monthly | ≥ 2 runs a week |
| Data age at decision | 21–28 days | ≤ 7 days |
| Decision turnaround (run → decision) | ~2 days a month of manual work | ≤ 24 h |
| Override rate | rules cover 80–85% | ≤ 20% |
| Stockout exposure at cost (units short of minimum cover × unit cost) | ₹18–22 lakh lost sales a quarter | −25% vs the first run |
| Perishable excess at cost (units above maximum cover × unit cost) | ₹10–12 lakh write-offs a quarter | −25% vs the first run |

Plus override reasons (the 15–20% judgment cases, i.e. candidates for new rules), decisions by planner, POs sent and units not re-ordered thanks to open-PO netting. Exposure only moves when a new stock snapshot is uploaded; at day 90 compare it with finance's actual figures. Targets live in `src/lib/results.ts` (`PLAN`).

## Run locally (no Neon needed)

```bash
npm install
cp .env.example .env        # keeps DATABASE_URL=pglite:./.pglite (embedded Postgres)
npm run db:migrate
npm run db:seed             # loads data/*.csv and creates run #1
npm run dev                 # http://localhost:3000
npm test                    # rules, netting, results and password tests
```

## Deploy (Neon + Vercel)

1. Deploy the repo to Vercel. The `vercel-build` script runs the database migrations first. If `DATABASE_URL` isn't set yet it skips them, so the first deploy still succeeds and the site shows a setup page.
2. In the Vercel project:
   - **Storage** → connect a Neon database. This sets `DATABASE_URL`; you can also add it by hand.
   - **Settings → Environment Variables** → add `GEMINI_API_KEY` (optional: `GEMINI_MODEL`, default `gemini-flash-latest`).
   - Add `SETUP_CODE` for the first-admin setup.
3. Redeploy. The build creates the tables.
4. Open `/setup`, create the admin, then click **Load sample data** or upload your own CSVs.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/upload` | multipart form with any of `weekly_sales`, `sku_master`, `distributor_master`, `current_inventory`, `calendar`, `sku_suppliers`, `open_purchase_orders`. Each file uploaded replaces its table (planner) |
| GET / POST | `/api/runs` | list runs / read open POs and run the rules (+ Gemini) on the current data (planner) |
| POST / DELETE | `/api/decisions` | approve, override (`finalQty` + `reasonCode`), or reject a recommendation / undo |
| POST | `/api/sample` | load the bundled seed CSVs and run the rules |
| GET | `/api/runs/:id/export` | CSV of approved orders and approved pauses (with supplier and Zoho PO number) |
| GET | `/api/zoho/connect`, `/api/zoho/callback` | Zoho OAuth connect flow (state cookie checked; only Zoho domains trusted) |
| POST | `/api/zoho/sync` | create or link suppliers as Zoho vendors and SKUs as Zoho items |
| POST | `/api/zoho/push` | send a run's approved lines to Zoho as draft POs, one per supplier |
| POST | `/api/zoho/disconnect` | revoke and forget the Zoho connection (admin) |
| POST | `/api/auth/login`, `/api/auth/logout`, `/api/auth/setup` | sign in / out; first-admin setup with `SETUP_CODE` |
| POST | `/api/account/password` | change your own password |
| GET / POST / PATCH | `/api/users` | list, add, change role / deactivate / reset password (admin) |

## Database (16 tables)

- **Seed data:** `skus`, `distributors`, `weekly_sales`, `inventory`, `calendar`, `sku_suppliers`
- **Created by the app:**
  - `runs`: one row per run
  - `recommendations`: per SKU per run: averages, cover, flags, action, qty, borderline, rule summary, AI explanation
  - `decisions`: Raghav's approval or override, with a reason code and, once sent, the Zoho PO number (sent lines are locked). This feeds the override-rate metric.
  - `zoho_connection`, `zoho_map`, `zoho_pushes`: the Zoho OAuth connection, local-to-Zoho ID mapping, and send history
  - `open_pos_csv`, `run_open_pos`: uploaded open POs, and the open PO lines each run netted off
  - `users`, `sessions`: accounts and sign-in sessions

## Zoho Inventory setup

1. Create a Zoho Inventory organization (India data centre: inventory.zoho.in).
2. In api-console.zoho.in create a **Server-based Application** with redirect URI `https://<your-app>/api/zoho/callback`.
3. Add `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` to Vercel (Production), redeploy.
4. In the app: **Zoho → Connect Zoho**, then **Sync suppliers & items**, then **Send approved to Zoho** on the dashboard.

`sku_suppliers.csv` (supplier, unit cost, lead time per SKU) is **fictional demo data**: the case does not name Freshroots' suppliers.

## Known gaps / future state

- The twice-weekly run is manual (upload + Re-run). Next: Vercel Cron Mon/Thu 6 am fed by an automated SAP export.
- Open-PO netting ignores arrival dates: a PO due after the stockout still counts. Next: compare each PO's expected date with weeks of cover.
- Exposure on the results page is a cost-based proxy; actual lost sales and write-offs come from finance at day 90.
- No email invites or self-service password reset (an admin resets passwords).
- AI anomaly detection, once 3 years of history is loaded.
