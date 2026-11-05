import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { recommendations, runOpenPos, runs } from "@/db/schema";
import { currentUser, loginRequiredToView } from "@/lib/auth";
import { RULES } from "@/lib/rules";
import { SCHEDULE, fmtIst, nextScheduledRun } from "@/lib/schedule";

export const dynamic = "force-dynamic";

type Rec = typeof recommendations.$inferSelect;

async function latest() {
  try {
    const db = await getDb();
    const [run] = await db.select().from(runs).orderBy(desc(runs.id)).limit(1);
    if (!run) return null;
    const recs = await db.select().from(recommendations).where(eq(recommendations.runId, run.id));
    const open = await db.select().from(runOpenPos).where(eq(runOpenPos.runId, run.id));
    return { run, recs, openLines: open.length };
  } catch {
    return null;
  }
}

const skuList = (recs: Rec[]) => (recs.length ? recs.map((r) => r.skuId).join(", ") : "none");

function Section({ n, title, intro, children }: { n: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section data-reveal className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="font-mono text-[11px] text-gray-500"><span className="text-accent">{n}</span> ——</div>
      <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">{title}</h2>
      {intro && <p className="mt-1 max-w-3xl text-sm text-gray-600">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Now({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block font-mono text-[11px] text-gray-500">this run: {children}</span>;
}

export default async function RulesPage() {
  if (!(await currentUser()) && loginRequiredToView()) redirect("/login");
  const data = await latest();
  const recs = data?.recs ?? [];
  const has = (f: string) => recs.filter((r) => r.flags.split(",").includes(f));
  const act = (a: string) => recs.filter((r) => r.action === a);
  const why = (x: string) => recs.filter((r) => (r.reviewReasons ?? "").split(",").includes(x));
  const run = data?.run;

  const ruleRows = [
    {
      id: "R1",
      name: "Cover window",
      rule: `Perishability High → ${RULES.highPerish.minWeeks}–${RULES.highPerish.maxWeeks} weeks of stock. Low → ${RULES.lowPerish.minWeeks}–${RULES.lowPerish.maxWeeks} weeks.`,
      now: `${recs.filter((r) => r.maxWeeks <= 4).length} perishable, ${recs.filter((r) => r.maxWeeks > 4).length} non-perishable SKUs`,
    },
    {
      id: "R2",
      name: "Festival uplift",
      rule: `If the stock as-of month is a festival month in calendar.csv (Oct, Nov, Mar), expected weekly demand = 12-week average × ${1 + RULES.festivalUplift}. Applied before the cover checks only.`,
      now: run ? `${run.asOfDate.slice(0, 7)} is ${run.isFestival ? "a festival month: uplift ON" : "not a festival month: uplift OFF"}` : "no run yet",
    },
    {
      id: "R3",
      name: "High demand",
      rule: `Last-4-week average more than ${RULES.highDemandLift * 100}% above the 12-week average (the 12 weeks include the last 4). Compares raw sales, no uplift.`,
      now: skuList(has("HIGH_DEMAND")),
    },
    {
      id: "R4",
      name: "Stockout risk",
      rule: "Weeks of cover (stock on hand ÷ expected weekly demand) below the window's minimum.",
      now: skuList(has("STOCKOUT_RISK")),
    },
    {
      id: "R5",
      name: "Overstock risk",
      rule: "Weeks of cover above the window's maximum.",
      now: skuList(has("OVERSTOCK_RISK")),
    },
    {
      id: "R6",
      name: "Open purchase orders",
      rule: "Units still due on Zoho POs (drafts, issued, part-received) and any uploaded open_purchase_orders.csv are subtracted from the order. Flags still use stock on hand: an open PO isn't on the shelf yet.",
      now: `${data?.openLines ?? 0} open PO line(s) read · ${act("COVERED").length} SKU(s) fully covered`,
    },
  ];

  const matrix = [
    ["Stockout + high demand", "Reorder now", `${RULES.highDemandMultiplier} × standard qty`, recs.filter((r) => r.action === "REORDER_NOW" && r.flags.includes("HIGH_DEMAND")).length],
    ["Stockout only", "Reorder now", "Standard qty", recs.filter((r) => r.action === "REORDER_NOW" && !r.flags.includes("HIGH_DEMAND")).length],
    ["High demand, not overstocked", "Reorder", `${RULES.highDemandMultiplier} × standard qty`, act("REORDER").length],
    ["Overstock only", "Pause next order", "0", act("PAUSE").length],
    ["Overstock + high demand", "Review (planner decides)", "0", recs.filter((r) => r.action === "REVIEW" && r.flags.includes("OVERSTOCK_RISK")).length],
    ["Any order already covered by open POs", "Covered by open PO", "max(0, rules qty − open PO qty)", act("COVERED").length],
    ["No flag", "No action", "0", act("NO_ACTION").length],
  ] as const;

  const review = [
    ["New launch", `Fewer than ${RULES.minHistoryWeeks} weeks of sales history: averages aren't reliable. Held at 0.`, why("New launch")],
    ["Demand swing", `Any week-on-week change above ±${RULES.swingPct * 100}% in the last ${RULES.swingTransitions} week-to-week moves. Stands in for unusual distributor behaviour (each SKU has one distributor). Keeps the rules' qty but needs a human look.`, why("Demand swing")],
    ["Conflicting flags", "High demand and overstock at the same time: the rules disagree, so no automatic quantity.", why("Conflicting flags")],
    ["Missing or invalid data", "No stock figure, no sales, perishability not High/Low, or standard qty ≤ 0. Held at 0, never guessed.", why("Missing or invalid data")],
    ["Borderline", `A value within ${RULES.borderlineBand * 100}% of a threshold (e.g. +21% vs the 20% line), or a flag that only exists because of the festival uplift.`, recs.filter((r) => r.borderline && !r.reviewReasons)],
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div data-reveal>
        <p className="font-mono text-xs text-gray-500">How every number is made</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-medium leading-[1] tracking-[-0.03em] text-ink">Rules &amp; assumptions</h1>
        <p className="mt-3 max-w-3xl text-ink-2">
          Raghav&apos;s documented rules, run in code in this order for every SKU. Gemini only writes the explanation; it never sets or changes a quantity.
          {run && <> Counts below are from the latest run, <Link href={`/?run=${run.id}`} className="underline">#{run.id}</Link>.</>}
        </p>
      </div>

      <Section n="01" title="The rules" intro="Read-only: these are the rules as Raghav wrote them down, plus how open POs are handled.">
        <ol className="divide-y divide-gray-100">
          {ruleRows.map((r) => (
            <li key={r.id} className="grid gap-1 py-3 sm:grid-cols-[4rem_10rem_1fr]">
              <span className="font-mono text-xs text-accent">{r.id}</span>
              <span className="font-medium text-gray-900">{r.name}</span>
              <span className="text-sm text-gray-700">{r.rule}<Now>{r.now}</Now></span>
            </li>
          ))}
        </ol>
      </Section>

      <Section n="02" title="From flags to an action" intro="When several flags apply, the first matching row wins.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="py-2">When the flags are</th><th>Action</th><th>Quantity</th><th className="text-right">SKUs this run</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matrix.map(([when, action, qty, n]) => (
                <tr key={when}><td className="py-2">{when}</td><td>{action}</td><td className="text-gray-600">{qty}</td><td className="text-right tabular-nums">{n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section n="03" title="What goes to Raghav" intro="This is the 15–20% the brief says he handles on judgment. Everything else is routine and can be approved in one click (Approve routine lines); exceptions are reviewed one by one, and an override always needs a reason.">
        <ul className="grid gap-3 md:grid-cols-2">
          {review.map(([name, desc, list]) => (
            <li key={name} className="card-lift rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900">{name}</span>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 font-mono text-[11px] text-violet-800">{list.length} this run</span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{desc}</p>
              {list.length > 0 && <p className="mt-2 font-mono text-[11px] text-gray-500">{list.map((r) => r.skuId).join(", ")}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <Section n="04" title="Data checks on upload" intro="A file that fails any check is rejected whole, with the row number, so the database is never half-loaded.">
        <ul className="grid gap-x-6 gap-y-2 text-sm text-gray-700 sm:grid-cols-2">
          {[
            "Every required column is present (per file)",
            "Week looks like 2026-W42; As_Of_Date looks like YYYY-MM-DD",
            "Units sold, units on hand and reorder qty are numbers; none negative",
            "No duplicate SKU + week, SKU + location or SKU rows",
            "Unit cost is a positive number (sku_suppliers)",
            "SKUs with missing stock or bad master data reach the rules as review items, not guesses",
          ].map((t) => (
            <li key={t} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{t}</li>
          ))}
        </ul>
      </Section>

      <Section n="05" title="Cadence & guardrails">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-900">Automatic runs</dt><dd className="text-gray-700">{SCHEDULE.label} (Vercel Cron): re-reads open POs from Zoho and runs the rules on the latest upload. Next: {fmtIst(nextScheduledRun())}. Planners can re-run any time.</dd></div>
          <div><dt className="font-medium text-gray-900">Code decides, AI explains</dt><dd className="text-gray-700">If Gemini fails or times out, the plain rule summary is shown instead. Nothing waits on the AI.</dd></div>
          <div><dt className="font-medium text-gray-900">Two human steps before an order</dt><dd className="text-gray-700">A planner approves each line here; lines reach Zoho only as <b>draft</b> POs that procurement reviews and issues. The app never contacts a supplier.</dd></div>
          <div><dt className="font-medium text-gray-900">Audit trail</dt><dd className="text-gray-700">Every decision stores who, when, the final qty and the reason. Lines sent to Zoho are locked. Override rate is tracked on the 90-day results page (target ≤ 20%).</dd></div>
        </dl>
      </Section>

      <Section n="06" title="Assumptions" intro="Stated so nobody has to guess.">
        <ul className="space-y-1.5 text-sm text-gray-700">
          {[
            "The 12-week average includes the latest 4 weeks.",
            "Festival status comes from the month of the stock as-of date; the uplift applies to the cover checks, not the high-demand check.",
            "Stock is summed across locations per SKU.",
            "A SKU's week-on-week swing stands in for a distributor swing, since each SKU maps to one distributor in the export.",
            "Supplier, unit cost and lead time per SKU (sku_suppliers.csv) are fictional demo data: the case doesn't name Freshroots' suppliers. They're needed to raise one Zoho PO per supplier.",
            "Open POs include drafts, so a line sent to Zoho isn't ordered again on the next run.",
            "Exposure on the results page is valued at unit cost: a leading indicator, not finance's lost-sales figure.",
          ].map((t) => <li key={t} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />{t}</li>)}
        </ul>
      </Section>
    </div>
  );
}
