import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { SkuResult } from "./rules";

/**
 * Gemini writes plain-English explanations for flagged / borderline SKUs.
 * It receives the rule outputs as facts and is told not to change any number.
 * If it fails or no key is set, the caller keeps the deterministic rule summary.
 */
export async function explainWithGemini(
  results: SkuResult[],
  ctx: { isFestival: boolean; asOfDate: string },
): Promise<Map<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const targets = results.filter((r) => r.action !== "NO_ACTION" || r.borderline);
  if (!targets.length) return new Map();

  const google = createGoogleGenerativeAI({ apiKey });
  // Lite model + minimal thinking: this is a short rewriting task, and the call
  // must finish well inside the serverless time limit.
  const model = google(process.env.GEMINI_MODEL || "gemini-flash-lite-latest");

  const facts = targets.map((r) => ({
    sku_id: r.skuId,
    name: r.name,
    perishability: r.perishability,
    flags: r.flags,
    action: r.action,
    recommended_qty: r.recommendedQty,
    units_on_hand: r.onHand,
    avg_last_4_weeks: r.avg4,
    avg_last_12_weeks: r.avg12,
    demand_lift_pct: r.demandLiftPct,
    weeks_of_cover: r.weeksOfCover,
    target_window_weeks: `${r.minWeeks}-${r.maxWeeks}`,
    borderline_notes: r.borderline,
  }));

  const call = (minimalThinking: boolean) => generateText({
    model,
    timeout: 40_000,
    maxRetries: 0,
    ...(minimalThinking ? { providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } } } : {}),
    output: Output.object({
      schema: z.object({
        explanations: z.array(z.object({ sku_id: z.string(), explanation: z.string() })),
      }),
    }),
    system:
      "You help Raghav, a demand planner at an Indian FMCG distributor, review reorder recommendations. " +
      "The numbers come from a deterministic rules engine and are final: never change, recompute or invent a number, " +
      "and never recommend a different quantity. For each SKU write 1-2 short sentences in plain English: why it was flagged, " +
      "and, if borderline_notes is present, what Raghav should double-check (e.g. open POs, a competitor scheme, a one-off order). " +
      "No preamble, no markdown.",
    prompt:
      `Planning date: ${ctx.asOfDate}. ${ctx.isFestival ? "This is a festival month, so expected demand includes a 25% uplift." : "Not a festival month."}\n` +
      `SKUs:\n${JSON.stringify(facts, null, 1)}`,
  });

  let output;
  try {
    ({ output } = await call(true));
  } catch (e) {
    // Some models reject thinkingConfig; retry once without it. Timeouts are not retried.
    if ((e as Error).name === "TimeoutError") throw e;
    console.warn("Gemini call with minimal thinking failed, retrying without it:", (e as Error).message);
    ({ output } = await call(false));
  }

  const known = new Set(targets.map((t) => t.skuId));
  return new Map(
    output.explanations
      .filter((e) => known.has(e.sku_id) && e.explanation.trim())
      .map((e) => [e.sku_id, e.explanation.trim()]),
  );
}
