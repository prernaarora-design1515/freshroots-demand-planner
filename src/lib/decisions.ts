import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { decisions, recommendations, skus, distributors, skuSuppliers } from "@/db/schema";

export const REASON_CODES = {
  OPEN_PO_EXISTS: "Open PO already covers it",
  NEW_LAUNCH: "New launch / not enough history",
  DISTRIBUTOR_EVENT: "Unusual distributor behaviour",
  COMPETITOR_SCHEME: "Competitor scheme / market event",
  SUPPLIER_CONSTRAINT: "Supplier / MOQ constraint",
  PERISHABILITY: "Shelf-life concern",
  OTHER: "Other (see note)",
} as const;

export const decisionInput = z
  .object({
    recommendationId: z.number().int().positive(),
    status: z.enum(["APPROVED", "OVERRIDDEN", "REJECTED"]),
    finalQty: z.number().int().min(0).max(1_000_000),
    reasonCode: z.enum(Object.keys(REASON_CODES) as [keyof typeof REASON_CODES, ...(keyof typeof REASON_CODES)[]]).nullish(),
    note: z.string().max(500).nullish(),
  })
  .refine((d) => d.status === "APPROVED" || !!d.reasonCode, {
    message: "A reason code is required when overriding or rejecting",
    path: ["reasonCode"],
  });

export type DecisionInput = z.infer<typeof decisionInput>;

export async function saveDecision(db: DB, input: DecisionInput) {
  const [rec] = await db.select().from(recommendations).where(eq(recommendations.id, input.recommendationId));
  if (!rec) throw new Error("Recommendation not found");
  await assertNotSent(db, rec.id);
  // Approving keeps the rules' quantity; anything else must explain itself.
  const finalQty = input.status === "APPROVED" ? rec.recommendedQty : input.status === "REJECTED" ? 0 : input.finalQty;
  const values = {
    recommendationId: rec.id,
    status: input.status,
    finalQty,
    reasonCode: input.status === "APPROVED" ? null : input.reasonCode ?? null,
    note: input.note ?? null,
    decidedAt: new Date(),
  };
  const [row] = await db
    .insert(decisions)
    .values(values)
    .onConflictDoUpdate({ target: decisions.recommendationId, set: values })
    .returning();
  return row;
}

/** Lines already sent to Zoho are locked here; changes happen on the PO in Zoho. */
async function assertNotSent(db: DB, recommendationId: number) {
  const [d] = await db.select().from(decisions).where(eq(decisions.recommendationId, recommendationId));
  if (d?.zohoPoId)
    throw new Error(`Already sent to Zoho on ${d.zohoPoNumber ?? "a draft PO"}. Change or delete the PO in Zoho instead.`);
}

export async function undoDecision(db: DB, recommendationId: number) {
  await assertNotSent(db, recommendationId);
  await db.delete(decisions).where(eq(decisions.recommendationId, recommendationId));
}

/** Lines procurement acts on: approved/overridden orders with qty > 0, plus approved pauses (hold the next order). */
export async function approvedOrderLines(db: DB, runId: number) {
  const recs = await db.select().from(recommendations).where(eq(recommendations.runId, runId));
  if (!recs.length) return [];
  const decs = await db
    .select()
    .from(decisions)
    .where(and(inArray(decisions.recommendationId, recs.map((r) => r.id)), inArray(decisions.status, ["APPROVED", "OVERRIDDEN"])));
  const skuRows = await db.select().from(skus);
  const distRows = await db.select().from(distributors);
  const supRows = await db.select().from(skuSuppliers);
  const supMap = new Map(supRows.map((x) => [x.skuId, x]));
  const skuMap = new Map(skuRows.map((s) => [s.skuId, s]));
  const distMap = new Map(distRows.map((d) => [d.distributorId, d]));
  const recMap = new Map(recs.map((r) => [r.id, r]));

  return decs
    .filter((d) => d.finalQty > 0 || (d.status === "APPROVED" && recMap.get(d.recommendationId)!.action === "PAUSE"))
    .map((d) => {
      const r = recMap.get(d.recommendationId)!;
      const s = skuMap.get(r.skuId);
      const dist = s ? distMap.get(s.distributorId) : undefined;
      return {
        Run_ID: runId,
        SKU_ID: r.skuId,
        SKU_Name: s?.name ?? "",
        Distributor_ID: s?.distributorId ?? "",
        Distributor_Name: dist?.name ?? "",
        Region: dist?.region ?? "",
        Supplier: supMap.get(r.skuId)?.supplierName ?? "",
        Action: r.action,
        Recommended_Qty: r.recommendedQty,
        Final_Qty: d.finalQty,
        Unit_of_Measure: s?.unitOfMeasure ?? "Units",
        Decision: d.status,
        Reason_Code: d.reasonCode ?? "",
        Note: d.note ?? "",
        Approved_By: d.decidedBy,
        Approved_At: d.decidedAt.toISOString(),
        Zoho_PO: d.zohoPoNumber ?? "",
      };
    })
    .sort((a, b) => a.SKU_ID.localeCompare(b.SKU_ID));
}
