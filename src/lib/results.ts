import type { DB } from "@/db";
import { decisions, recommendations, runs, zohoPushes } from "@/db/schema";
import { REASON_CODES } from "./decisions";

/**
 * 90-day measurement plan for the demand-planning pilot.
 *
 * Baselines come from Deepa's brief. Targets are the pilot's proposed bars;
 * change them here if the steering group agrees different ones.
 */
export const PLAN = {
  days: 90,
  baseline: {
    cadence: "Monthly (1 forecast a month)",
    dataAge: "21–28 days old when procurement acts",
    stockoutCost: "₹18–22 lakh lost sales a quarter",
    writeOffCost: "₹10–12 lakh perishable write-offs a quarter",
    plannerTime: "~2 working days a month of manual data work",
  },
  targets: {
    runsPerWeek: 2,
    maxDataAgeDays: 7,
    maxDecisionHours: 24,
    maxOverridePct: 20, // Raghav: rules govern 80–85% of decisions
    exposureCutPct: 25, // stockout & perishable-excess exposure vs the first run
  },
} as const;

export interface ResultsInput {
  now: Date;
  runs: { id: number; createdAt: Date; asOfDate: string; flaggedCount: number }[];
  recs: {
    id: number;
    runId: number;
    skuId: string;
    action: string;
    onHand: number;
    expectedWeeklyDemand: number;
    weeksOfCover: number;
    minWeeks: number;
    maxWeeks: number;
    grossQty: number;
    recommendedQty: number;
    unitCost: number | null;
  }[];
  decisions: { recommendationId: number; status: string; finalQty: number; reasonCode: string | null; decidedBy: string; decidedAt: Date; zohoPoNumber: string | null }[];
  pushes: { status: string; totalQty: number; createdAt: Date }[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const DAY = 86_400_000;

/** Exposure at cost, per run: what's short of the minimum cover, and perishable stock beyond the maximum. */
function exposure(recs: ResultsInput["recs"]) {
  let stockoutUnits = 0, stockoutValue = 0, excessUnits = 0, excessValue = 0, zeroStock = 0, missingCost = 0;
  for (const r of recs) {
    const cost = r.unitCost ?? 0;
    if (r.unitCost == null) missingCost++;
    if (r.onHand <= 0) zeroStock++;
    const short = Math.max(0, r.minWeeks * r.expectedWeeklyDemand - r.onHand);
    if (r.weeksOfCover < r.minWeeks) {
      stockoutUnits += short;
      stockoutValue += short * cost;
    }
    const perishable = r.maxWeeks <= 4;
    if (perishable && r.weeksOfCover > r.maxWeeks && r.weeksOfCover < 999) {
      const excess = r.onHand - r.maxWeeks * r.expectedWeeklyDemand;
      excessUnits += excess;
      excessValue += excess * cost;
    }
  }
  return {
    stockoutSkus: recs.filter((r) => r.weeksOfCover < r.minWeeks).length,
    stockoutUnits: Math.round(stockoutUnits),
    stockoutValue: Math.round(stockoutValue),
    perishableExcessSkus: recs.filter((r) => r.maxWeeks <= 4 && r.weeksOfCover > r.maxWeeks && r.weeksOfCover < 999).length,
    excessUnits: Math.round(excessUnits),
    excessValue: Math.round(excessValue),
    zeroStock,
    missingCost,
  };
}

export function computeResults(input: ResultsInput) {
  const runsAsc = [...input.runs].sort((a, b) => a.id - b.id);
  const first = runsAsc[0];
  const latest = runsAsc.at(-1);
  if (!first || !latest) return null;

  const start = first.createdAt;
  const dayOfPlan = Math.min(PLAN.days, Math.floor((input.now.getTime() - start.getTime()) / DAY) + 1);
  const weeksElapsed = Math.max(1, (input.now.getTime() - start.getTime()) / (7 * DAY));

  /* Cadence & freshness */
  const runsLast7 = runsAsc.filter((r) => input.now.getTime() - r.createdAt.getTime() <= 7 * DAY).length;
  const runsPerWeek = round(runsAsc.length / weeksElapsed);
  const dataAges = runsAsc.map((r) => (r.createdAt.getTime() - new Date(`${r.asOfDate}T00:00:00+05:30`).getTime()) / DAY);
  const medianDataAge = median(dataAges.map((d) => Math.max(0, d)));

  /* Decisions */
  const recById = new Map(input.recs.map((r) => [r.id, r]));
  const runById = new Map(runsAsc.map((r) => [r.id, r]));
  const decs = input.decisions.filter((d) => recById.has(d.recommendationId));
  const hours = decs.map((d) => {
    const run = runById.get(recById.get(d.recommendationId)!.runId)!;
    return (d.decidedAt.getTime() - run.createdAt.getTime()) / 3_600_000;
  });
  const approved = decs.filter((d) => d.status === "APPROVED").length;
  const overridden = decs.filter((d) => d.status === "OVERRIDDEN").length;
  const rejected = decs.filter((d) => d.status === "REJECTED").length;
  const overridePct = decs.length ? round(((overridden + rejected) / decs.length) * 100) : null;

  const reasons = new Map<string, number>();
  for (const d of decs) if (d.reasonCode) reasons.set(d.reasonCode, (reasons.get(d.reasonCode) ?? 0) + 1);
  const byPlanner = new Map<string, { decided: number; overridden: number }>();
  for (const d of decs) {
    const p = byPlanner.get(d.decidedBy) ?? { decided: 0, overridden: 0 };
    p.decided++;
    if (d.status !== "APPROVED") p.overridden++;
    byPlanner.set(d.decidedBy, p);
  }

  /* Latest run decision coverage */
  const latestRecs = input.recs.filter((r) => r.runId === latest.id);
  const latestFlagged = latestRecs.filter((r) => r.action !== "NO_ACTION");
  const decidedIds = new Set(decs.map((d) => d.recommendationId));
  const latestDecided = latestFlagged.filter((r) => decidedIds.has(r.id)).length;

  /* Exposure trend */
  const trend = runsAsc.map((run) => ({ runId: run.id, createdAt: run.createdAt.toISOString(), asOfDate: run.asOfDate, ...exposure(input.recs.filter((r) => r.runId === run.id)) }));
  const t0 = trend[0], tN = trend.at(-1)!;
  const change = (a: number, b: number) => (a > 0 ? round(((b - a) / a) * 100) : null);
  const distinctSnapshots = new Set(runsAsc.map((r) => r.asOfDate)).size;

  /* Ordering */
  const sent = decs.filter((d) => d.zohoPoNumber);
  const sentValue = sent.reduce((s, d) => s + d.finalQty * (recById.get(d.recommendationId)!.unitCost ?? 0), 0);
  const posCreated = input.pushes.filter((p) => p.status === "created").length;
  const pushFailures = input.pushes.filter((p) => p.status === "failed").length;
  const nettedLatest = latestRecs.reduce((s, r) => s + Math.max(0, r.grossQty - r.recommendedQty), 0);
  const nettedValueLatest = latestRecs.reduce((s, r) => s + Math.max(0, r.grossQty - r.recommendedQty) * (r.unitCost ?? 0), 0);

  const T = PLAN.targets;
  const status = (ok: boolean | null) => (ok === null ? "no-data" : ok ? "on-track" : "off-track");

  return {
    start: start.toISOString(),
    dayOfPlan,
    runCount: runsAsc.length,
    latestRunId: latest.id,
    distinctSnapshots,
    scorecard: [
      {
        key: "cadence",
        label: "Planning cadence",
        value: `${runsPerWeek} runs / week`,
        detail: `${runsLast7} in the last 7 days · ${runsAsc.length} since day 1`,
        baseline: PLAN.baseline.cadence,
        target: `≥ ${T.runsPerWeek} runs / week`,
        status: status(runsPerWeek >= T.runsPerWeek),
      },
      {
        key: "freshness",
        label: "Data age at decision",
        value: medianDataAge === null ? "–" : `${round(medianDataAge)} days`,
        detail: "median days between the stock snapshot and the run",
        baseline: PLAN.baseline.dataAge,
        target: `≤ ${T.maxDataAgeDays} days`,
        status: status(medianDataAge === null ? null : medianDataAge <= T.maxDataAgeDays),
      },
      {
        key: "turnaround",
        label: "Decision turnaround",
        value: hours.length ? `${round(median(hours)!)} h` : "–",
        detail: `median hours from run to decision · ${decs.length} decisions`,
        baseline: PLAN.baseline.plannerTime,
        target: `≤ ${T.maxDecisionHours} h`,
        status: status(hours.length ? median(hours)! <= T.maxDecisionHours : null),
      },
      {
        key: "override",
        label: "Override rate",
        value: overridePct === null ? "–" : `${overridePct}%`,
        detail: `${approved} approved · ${overridden} overridden · ${rejected} rejected`,
        baseline: "Rules cover 80–85% of decisions (Raghav)",
        target: `≤ ${T.maxOverridePct}%`,
        status: status(overridePct === null ? null : overridePct <= T.maxOverridePct),
      },
      {
        key: "stockout",
        label: "Stockout exposure (at cost)",
        value: `₹${tN.stockoutValue.toLocaleString("en-IN")}`,
        detail: `${tN.stockoutSkus} SKU(s) below minimum cover${change(t0.stockoutValue, tN.stockoutValue) !== null ? ` · ${change(t0.stockoutValue, tN.stockoutValue)}% vs run #${t0.runId}` : ""}`,
        baseline: PLAN.baseline.stockoutCost,
        target: `−${T.exposureCutPct}% vs the first run`,
        status: distinctSnapshots < 2 ? "no-data" : status(tN.stockoutValue <= t0.stockoutValue * (1 - T.exposureCutPct / 100)),
      },
      {
        key: "writeoff",
        label: "Perishable excess (write-off risk, at cost)",
        value: `₹${tN.excessValue.toLocaleString("en-IN")}`,
        detail: `${tN.perishableExcessSkus} perishable SKU(s) above maximum cover${change(t0.excessValue, tN.excessValue) !== null ? ` · ${change(t0.excessValue, tN.excessValue)}% vs run #${t0.runId}` : ""}`,
        baseline: PLAN.baseline.writeOffCost,
        target: `−${T.exposureCutPct}% vs the first run`,
        status: distinctSnapshots < 2 ? "no-data" : status(tN.excessValue <= t0.excessValue * (1 - T.exposureCutPct / 100)),
      },
    ],
    trend,
    decisions: {
      total: decs.length,
      approved,
      overridden,
      rejected,
      latestDecided,
      latestFlagged: latestFlagged.length,
      reasons: [...reasons.entries()]
        .map(([code, n]) => ({ code, label: REASON_CODES[code as keyof typeof REASON_CODES] ?? code, n }))
        .sort((a, b) => b.n - a.n),
      byPlanner: [...byPlanner.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.decided - a.decided),
    },
    ordering: {
      linesSent: sent.length,
      unitsSent: sent.reduce((s, d) => s + d.finalQty, 0),
      valueSent: Math.round(sentValue),
      posCreated,
      pushFailures,
      nettedLatest,
      nettedValueLatest: Math.round(nettedValueLatest),
    },
    missingCost: tN.missingCost,
  };
}

export type Results = NonNullable<ReturnType<typeof computeResults>>;

export async function loadResults(db: DB) {
  const [runRows, recRows, decRows, pushRows] = await Promise.all([
    db.select({ id: runs.id, createdAt: runs.createdAt, asOfDate: runs.asOfDate, flaggedCount: runs.flaggedCount }).from(runs),
    db
      .select({
        id: recommendations.id,
        runId: recommendations.runId,
        skuId: recommendations.skuId,
        action: recommendations.action,
        onHand: recommendations.onHand,
        expectedWeeklyDemand: recommendations.expectedWeeklyDemand,
        weeksOfCover: recommendations.weeksOfCover,
        minWeeks: recommendations.minWeeks,
        maxWeeks: recommendations.maxWeeks,
        grossQty: recommendations.grossQty,
        recommendedQty: recommendations.recommendedQty,
        unitCost: recommendations.unitCost,
      })
      .from(recommendations),
    db
      .select({
        recommendationId: decisions.recommendationId,
        status: decisions.status,
        finalQty: decisions.finalQty,
        reasonCode: decisions.reasonCode,
        decidedBy: decisions.decidedBy,
        decidedAt: decisions.decidedAt,
        zohoPoNumber: decisions.zohoPoNumber,
      })
      .from(decisions),
    db.select({ status: zohoPushes.status, totalQty: zohoPushes.totalQty, createdAt: zohoPushes.createdAt }).from(zohoPushes),
  ]);
  return computeResults({ now: new Date(), runs: runRows.map((r) => ({ ...r, asOfDate: String(r.asOfDate) })), recs: recRows, decisions: decRows, pushes: pushRows });
}
