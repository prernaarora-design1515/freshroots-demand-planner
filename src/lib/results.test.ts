import { describe, it, expect } from "vitest";
import { computeResults, type ResultsInput } from "./results";

const day = 86_400_000;
const t0 = new Date("2026-10-20T04:00:00Z");
const rec = (id: number, runId: number, o: Partial<ResultsInput["recs"][number]> = {}) => ({
  id, runId, skuId: `S${id % 10}`, action: "REORDER_NOW", onHand: 100, expectedWeeklyDemand: 50, weeksOfCover: 2,
  minWeeks: 6, maxWeeks: 14, grossQty: 300, recommendedQty: 300, unitCost: 10, ...o,
});

describe("computeResults", () => {
  const input: ResultsInput = {
    now: new Date(t0.getTime() + 10 * day),
    runs: [
      { id: 1, createdAt: t0, asOfDate: "2026-10-19", flaggedCount: 2 },
      { id: 2, createdAt: new Date(t0.getTime() + 3.5 * day), asOfDate: "2026-10-23", flaggedCount: 2 },
      { id: 3, createdAt: new Date(t0.getTime() + 7 * day), asOfDate: "2026-10-26", flaggedCount: 1 },
    ],
    recs: [
      rec(1, 1), // short 6*50-100 = 200 units -> ₹2000
      rec(2, 1, { action: "PAUSE", weeksOfCover: 6, minWeeks: 3, maxWeeks: 4, onHand: 300, grossQty: 0, recommendedQty: 0 }), // excess 300-200=100 -> ₹1000
      rec(3, 2),
      rec(4, 2, { action: "PAUSE", weeksOfCover: 6, minWeeks: 3, maxWeeks: 4, onHand: 300, grossQty: 0, recommendedQty: 0 }),
      rec(5, 3, { onHand: 250, weeksOfCover: 5, action: "COVERED", grossQty: 300, recommendedQty: 0 }), // short 50 -> ₹500
      rec(6, 3, { action: "NO_ACTION", weeksOfCover: 4, minWeeks: 3, maxWeeks: 4, onHand: 200, grossQty: 0, recommendedQty: 0 }),
    ],
    decisions: [
      { recommendationId: 1, status: "APPROVED", finalQty: 300, reasonCode: null, decidedBy: "Raghav", decidedAt: new Date(t0.getTime() + 2 * 3_600_000), zohoPoNumber: "PO-1" },
      { recommendationId: 2, status: "REJECTED", finalQty: 0, reasonCode: "DISTRIBUTOR_EVENT", decidedBy: "Asha", decidedAt: new Date(t0.getTime() + 4 * 3_600_000), zohoPoNumber: null },
      { recommendationId: 5, status: "APPROVED", finalQty: 0, reasonCode: null, decidedBy: "Raghav", decidedAt: new Date(t0.getTime() + 7 * day + 3_600_000), zohoPoNumber: null },
    ],
    pushes: [{ status: "created", totalQty: 300, createdAt: t0 }],
  };
  const r = computeResults(input)!;
  const card = (k: string) => r.scorecard.find((c) => c.key === k)!;

  it("tracks the plan window and cadence", () => {
    expect(r.dayOfPlan).toBe(11);
    expect(r.runCount).toBe(3);
    expect(card("cadence").status).toBe("on-track"); // 3 runs in ~1.4 weeks = 2.1/week
  });

  it("computes exposure at cost per run and the change vs run 1", () => {
    expect(r.trend[0]).toMatchObject({ stockoutUnits: 200, stockoutValue: 2000, excessUnits: 100, excessValue: 1000 });
    expect(r.trend[2]).toMatchObject({ stockoutValue: 500, excessValue: 0 });
    expect(card("stockout").status).toBe("on-track"); // -75%
    expect(card("writeoff").status).toBe("on-track");
  });

  it("override rate, turnaround, reasons and per-planner counts", () => {
    expect(r.decisions).toMatchObject({ total: 3, approved: 2, rejected: 1 });
    expect(card("override").value).toBe("33.3%");
    expect(card("override").status).toBe("off-track");
    expect(card("turnaround").value).toBe("2 h");
    expect(r.decisions.reasons[0]).toMatchObject({ code: "DISTRIBUTOR_EVENT", n: 1 });
    expect(r.decisions.byPlanner.find((p) => p.name === "Raghav")).toMatchObject({ decided: 2, overridden: 0 });
  });

  it("ordering and netting", () => {
    expect(r.ordering).toMatchObject({ linesSent: 1, unitsSent: 300, valueSent: 3000, posCreated: 1, nettedLatest: 300, nettedValueLatest: 3000 });
  });

  it("same snapshot every run -> exposure marked as not enough data", () => {
    const same = computeResults({ ...input, runs: input.runs.map((x) => ({ ...x, asOfDate: "2026-10-19" })) })!;
    expect(same.scorecard.find((c) => c.key === "stockout")!.status).toBe("no-data");
  });

  it("no runs -> null", () => {
    expect(computeResults({ ...input, runs: [] })).toBeNull();
  });
});
