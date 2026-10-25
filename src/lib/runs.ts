import { desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import {
  calendar,
  decisions,
  distributors,
  inventory,
  recommendations,
  runs,
  skuSuppliers,
  skus,
  weeklySales,
} from "@/db/schema";
import { evaluate } from "./rules";
import { explainWithGemini } from "./explain";

/** Runs Raghav's rules on what's in the database, stores the run, then asks Gemini for explanations. */
export async function createRun(db: DB, opts: { withAi?: boolean } = {}) {
  const [skuRows, salesRows, invRows, calRows] = await Promise.all([
    db.select().from(skus),
    db.select().from(weeklySales),
    db.select().from(inventory),
    db.select().from(calendar),
  ]);
  if (!skuRows.length || !salesRows.length || !invRows.length)
    throw new Error("Load sku_master, weekly_sales and current_inventory before running.");

  const onHand: Record<string, number> = {};
  for (const r of invRows) onHand[r.skuId] = (onHand[r.skuId] ?? 0) + r.unitsOnHand; // sum across locations
  const asOfDate = invRows.map((r) => String(r.asOfDate)).sort().at(-1)!;
  const isFestival = calRows.find((c) => c.yearMonth === asOfDate.slice(0, 7))?.isFestivalMonth ?? false;
  const latestWeek = salesRows.map((s) => s.week).sort().at(-1)!;

  const results = evaluate({ skus: skuRows, sales: salesRows, onHand, isFestival });
  const flagged = results.filter((r) => r.action !== "NO_ACTION").length;

  const [run] = await db
    .insert(runs)
    .values({ asOfDate, latestWeek, isFestival, skuCount: results.length, flaggedCount: flagged, aiStatus: "pending" })
    .returning();

  await db.insert(recommendations).values(
    results.map((r) => ({
      runId: run.id,
      skuId: r.skuId,
      avg4: r.avg4,
      avg12: r.avg12,
      demandLiftPct: r.demandLiftPct,
      expectedWeeklyDemand: r.expectedWeeklyDemand,
      weeksOfCover: r.weeksOfCover,
      minWeeks: r.minWeeks,
      maxWeeks: r.maxWeeks,
      flags: r.flags.join(","),
      action: r.action,
      recommendedQty: r.recommendedQty,
      borderline: r.borderline,
      needsJudgment: r.needsJudgment,
      ruleSummary: r.ruleSummary,
    })),
  );

  // AI step: optional and never blocks the run.
  let aiStatus = "skipped";
  if (opts.withAi !== false && process.env.GEMINI_API_KEY) {
    try {
      const texts = await explainWithGemini(results, { isFestival, asOfDate });
      const recs = await db.select().from(recommendations).where(eq(recommendations.runId, run.id));
      for (const rec of recs) {
        const t = texts.get(rec.skuId);
        if (t) await db.update(recommendations).set({ aiExplanation: t }).where(eq(recommendations.id, rec.id));
      }
      aiStatus = "ok";
    } catch (e) {
      console.error("Gemini explanation failed:", e);
      aiStatus = "failed";
    }
  }
  await db.update(runs).set({ aiStatus }).where(eq(runs.id, run.id));
  return { ...run, aiStatus };
}

export async function latestRun(db: DB) {
  const [run] = await db.select().from(runs).orderBy(desc(runs.id)).limit(1);
  return run ?? null;
}

export async function listRuns(db: DB) {
  return db.select().from(runs).orderBy(desc(runs.id)).limit(20);
}

/** Everything the dashboard needs for one run. */
export async function runDetail(db: DB, runId: number) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) return null;
  const recs = await db.select().from(recommendations).where(eq(recommendations.runId, runId));
  const ids = recs.map((r) => r.id);
  const [skuRows, distRows, decRows, salesRows, supRows] = await Promise.all([
    db.select().from(skus),
    db.select().from(distributors),
    ids.length ? db.select().from(decisions).where(inArray(decisions.recommendationId, ids)) : Promise.resolve([]),
    db.select().from(weeklySales),
    db.select().from(skuSuppliers),
  ]);
  const supMap = new Map(supRows.map((s) => [s.skuId, s]));
  const skuMap = new Map(skuRows.map((s) => [s.skuId, s]));
  const distMap = new Map(distRows.map((d) => [d.distributorId, d]));
  const decMap = new Map(decRows.map((d) => [d.recommendationId, d]));
  const history = new Map<string, { week: string; units: number }[]>();
  for (const s of salesRows.sort((a, b) => a.week.localeCompare(b.week))) {
    if (!history.has(s.skuId)) history.set(s.skuId, []);
    history.get(s.skuId)!.push({ week: s.week, units: s.unitsSold });
  }

  const order = { REORDER_NOW: 0, REVIEW: 1, REORDER: 2, PAUSE: 3, NO_ACTION: 4 } as Record<string, number>;
  const rows = recs
    .map((r) => {
      const sku = skuMap.get(r.skuId);
      const dist = sku ? distMap.get(sku.distributorId) : undefined;
      const d = decMap.get(r.id);
      return {
        ...r,
        flags: r.flags ? r.flags.split(",") : [],
        skuName: sku?.name ?? r.skuId,
        category: sku?.category ?? "",
        perishability: sku?.perishability ?? "",
        standardReorderQty: sku?.standardReorderQty ?? 0,
        distributorName: dist?.name ?? sku?.distributorId ?? "",
        region: dist?.region ?? "",
        supplierName: supMap.get(r.skuId)?.supplierName ?? null,
        history: (history.get(r.skuId) ?? []).slice(-12),
        decision: d
          ? {
              status: d.status,
              finalQty: d.finalQty,
              reasonCode: d.reasonCode,
              note: d.note,
              decidedAt: d.decidedAt.toISOString(),
              zohoPoNumber: d.zohoPoNumber,
            }
          : null,
      };
    })
    .sort((a, b) => order[a.action] - order[b.action] || a.skuId.localeCompare(b.skuId));

  return { run: { ...run, createdAt: run.createdAt.toISOString() }, rows };
}

export type RunDetail = NonNullable<Awaited<ReturnType<typeof runDetail>>>;
export type DashboardRow = RunDetail["rows"][number];
