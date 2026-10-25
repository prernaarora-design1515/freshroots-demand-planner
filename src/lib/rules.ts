/**
 * Raghav's demand-planning rules, as documented in the Freshroots brief.
 * Deterministic and side-effect free: the numbers come from here, never from the LLM.
 *
 * Decisions agreed for this build:
 *  - 12-week average INCLUDES the latest 4 weeks (latest 12 weeks of sales).
 *  - The 25% festival uplift applies to expected weekly demand, i.e. only the
 *    weeks-of-cover checks. The high-demand check compares raw sales.
 *  - Festival status is taken from the month of the inventory as-of date
 *    (the month we are planning for), looked up in the calendar.
 */

export const RULES = {
  highDemandLift: 0.2, // last 4 wks > 20% above 12-wk avg
  highDemandMultiplier: 1.5, // reorder at 1.5x standard qty
  festivalUplift: 0.25,
  lowPerish: { minWeeks: 6, maxWeeks: 14 },
  highPerish: { minWeeks: 3, maxWeeks: 4 },
  borderlineBand: 0.1, // within 10% of a threshold counts as borderline
  minHistoryWeeks: 12,
} as const;

export type Flag = "HIGH_DEMAND" | "STOCKOUT_RISK" | "OVERSTOCK_RISK";
export type Action = "REORDER_NOW" | "REORDER" | "PAUSE" | "REVIEW" | "NO_ACTION";

export interface SkuInput {
  skuId: string;
  name: string;
  perishability: string; // "Low" | "High"
  standardReorderQty: number;
}

export interface EvaluateInput {
  skus: SkuInput[];
  sales: { skuId: string; week: string; unitsSold: number }[];
  onHand: Record<string, number>;
  isFestival: boolean;
}

export interface SkuResult {
  skuId: string;
  name: string;
  perishability: string;
  avg4: number;
  avg12: number;
  demandLiftPct: number; // e.g. 21.4 means +21.4%
  expectedWeeklyDemand: number;
  weeksOfCover: number;
  minWeeks: number;
  maxWeeks: number;
  onHand: number;
  flags: Flag[];
  action: Action;
  recommendedQty: number;
  borderline: string | null;
  needsJudgment: boolean;
  ruleSummary: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const near = (value: number, threshold: number) =>
  Math.abs(value - threshold) <= threshold * RULES.borderlineBand;

export function evaluate(input: EvaluateInput): SkuResult[] {
  const byS = new Map<string, { week: string; unitsSold: number }[]>();
  for (const s of input.sales) {
    if (!byS.has(s.skuId)) byS.set(s.skuId, []);
    byS.get(s.skuId)!.push(s);
  }

  return input.skus.map((sku) => {
    const history = (byS.get(sku.skuId) ?? [])
      .slice()
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((s) => s.unitsSold);
    const onHand = input.onHand[sku.skuId] ?? 0;
    const isHigh = sku.perishability.toLowerCase() === "high";
    const { minWeeks, maxWeeks } = isHigh ? RULES.highPerish : RULES.lowPerish;

    const avg4 = mean(history.slice(-4));
    const avg12 = mean(history.slice(-12));
    const uplift = input.isFestival ? 1 + RULES.festivalUplift : 1;
    const expected = avg12 * uplift;
    const woc = expected > 0 ? onHand / expected : Infinity;
    const wocNoUplift = avg12 > 0 ? onHand / avg12 : Infinity;
    const lift = avg12 > 0 ? avg4 / avg12 - 1 : 0;

    const base = {
      skuId: sku.skuId,
      name: sku.name,
      perishability: sku.perishability,
      avg4: round1(avg4),
      avg12: round1(avg12),
      demandLiftPct: round1(lift * 100),
      expectedWeeklyDemand: round1(expected),
      weeksOfCover: Number.isFinite(woc) ? round1(woc) : 999,
      minWeeks,
      maxWeeks,
      onHand,
    };

    // New launches / thin history: the rules can't be trusted -> Raghav decides.
    if (history.length < RULES.minHistoryWeeks) {
      return {
        ...base,
        flags: [],
        action: "REVIEW",
        recommendedQty: 0,
        borderline: null,
        needsJudgment: true,
        ruleSummary: `Only ${history.length} week(s) of sales history (rules need ${RULES.minHistoryWeeks}). Treat as a new launch: planner judgment required.`,
      };
    }

    const flags: Flag[] = [];
    if (lift > RULES.highDemandLift) flags.push("HIGH_DEMAND");
    if (woc < minWeeks) flags.push("STOCKOUT_RISK");
    if (woc > maxWeeks) flags.push("OVERSTOCK_RISK");

    // Priority when flags combine.
    let action: Action = "NO_ACTION";
    let qty = 0;
    let needsJudgment = false;
    const std = sku.standardReorderQty;
    const hd = flags.includes("HIGH_DEMAND");
    if (flags.includes("STOCKOUT_RISK")) {
      action = "REORDER_NOW";
      qty = hd ? Math.round(std * RULES.highDemandMultiplier) : std;
    } else if (flags.includes("OVERSTOCK_RISK") && hd) {
      action = "REVIEW"; // demand is rising but stock is high: conflicting signals
      needsJudgment = true;
    } else if (flags.includes("OVERSTOCK_RISK")) {
      action = "PAUSE";
    } else if (hd) {
      action = "REORDER";
      qty = Math.round(std * RULES.highDemandMultiplier);
    }

    // Deterministic borderline notes (the LLM only rephrases these).
    const notes: string[] = [];
    if (near(lift, RULES.highDemandLift))
      notes.push(`demand lift ${base.demandLiftPct}% is close to the 20% high-demand line`);
    if (near(woc, minWeeks))
      notes.push(`${base.weeksOfCover} weeks of cover is close to the ${minWeeks}-week minimum`);
    if (near(woc, maxWeeks))
      notes.push(`${base.weeksOfCover} weeks of cover is close to the ${maxWeeks}-week maximum`);
    if (input.isFestival) {
      const stockoutNoUplift = wocNoUplift < minWeeks;
      const overNoUplift = wocNoUplift > maxWeeks;
      if (flags.includes("STOCKOUT_RISK") !== stockoutNoUplift)
        notes.push(`stockout flag is caused by the festival uplift (${round1(wocNoUplift)} weeks without it)`);
      if (flags.includes("OVERSTOCK_RISK") !== overNoUplift)
        notes.push(`overstock flag changes with the festival uplift (${round1(wocNoUplift)} weeks without it)`);
    }
    const borderline = notes.length ? notes.join("; ") : null;

    return {
      ...base,
      flags,
      action,
      recommendedQty: qty,
      borderline,
      needsJudgment,
      ruleSummary: summarise(base, flags, action, qty, std, input.isFestival, isHigh),
    };
  });
}

function summarise(
  b: { demandLiftPct: number; weeksOfCover: number; minWeeks: number; maxWeeks: number; avg12: number; onHand: number },
  flags: Flag[],
  action: Action,
  qty: number,
  std: number,
  festival: boolean,
  isHigh: boolean,
): string {
  const window = `${b.minWeeks}–${b.maxWeeks} weeks${isHigh ? " (high-perishability)" : ""}`;
  const cover = `${b.onHand} units on hand = ${b.weeksOfCover} weeks of cover${festival ? " incl. 25% festival uplift" : ""}; target ${window}.`;
  const lift = `Last 4 weeks are ${b.demandLiftPct >= 0 ? "+" : ""}${b.demandLiftPct}% vs the 12-week average (${b.avg12}/wk).`;
  switch (action) {
    case "REORDER_NOW":
      return `Stockout risk. ${cover} ${lift} Reorder now: ${qty} units${flags.includes("HIGH_DEMAND") ? ` (1.5× standard ${std}, high demand)` : " (standard qty)"}.`;
    case "REORDER":
      return `High demand. ${lift} ${cover} Reorder ${qty} units (1.5× standard ${std}).`;
    case "PAUSE":
      return `Overstock risk. ${cover} Pause the next order.`;
    case "REVIEW":
      return `Conflicting signals: high demand but overstocked. ${lift} ${cover} Planner judgment required.`;
    default:
      return `Within range. ${cover} ${lift} No action.`;
  }
}
