import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { openPosCsv, skus, zohoMap } from "@/db/schema";
import { getConnection, isZohoConfigured, zoho } from "./zoho/client";

export interface OpenPoLine {
  skuId: string;
  source: "zoho" | "csv";
  poNumber: string;
  status: string;
  openQty: number;
  expectedDate: string | null;
  vendor: string | null;
}

/** Zoho PO states that mean "nothing more will arrive". */
const FINISHED = new Set(["cancelled", "closed", "void", "received", "rejected"]);
const MAX_PO_DETAILS = 60; // keeps a run well inside the serverless time limit and Zoho's rate limit

/**
 * Reads purchase orders from Zoho Inventory that can still deliver stock
 * (drafts, issued/open, partially received) and returns the undelivered
 * quantity per line. Drafts count too: they are orders already in the pipeline,
 * including the ones this app created, so they must not be ordered twice.
 */
export async function readZohoOpenPos(db: DB): Promise<OpenPoLine[]> {
  const conn = await getConnection(db);
  if (!conn) return [];
  const [skuRows, itemMapRows] = await Promise.all([
    db.select({ skuId: skus.skuId }).from(skus),
    db.select().from(zohoMap).where(and(eq(zohoMap.kind, "item"), eq(zohoMap.orgId, conn.orgId))),
  ]);
  const known = new Set(skuRows.map((s) => s.skuId));
  const byItemId = new Map(itemMapRows.map((m) => [m.zohoId, m.localId]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await zoho(db, "GET", "/purchaseorders", { query: { page: String(page), per_page: "200" } });
    list.push(...(res.purchaseorders ?? []));
    if (!res.page_context?.has_more_page) break;
  }
  const live = list.filter(
    (po) => !FINISHED.has(String(po.status ?? "").toLowerCase()) && String(po.received_status ?? "").toLowerCase() !== "received",
  );

  const out: OpenPoLine[] = [];
  for (const po of live.slice(0, MAX_PO_DETAILS)) {
    const res = await zoho(db, "GET", `/purchaseorders/${encodeURIComponent(String(po.purchaseorder_id))}`);
    const d = res.purchaseorder ?? {};
    for (const li of d.line_items ?? []) {
      const skuId = known.has(String(li.sku ?? "")) ? String(li.sku) : byItemId.get(String(li.item_id ?? ""));
      if (!skuId) continue; // not one of our SKUs
      const remaining =
        Number(li.quantity ?? 0) - Number(li.quantity_received ?? 0) - Number(li.quantity_cancelled ?? 0);
      if (!(remaining > 0)) continue;
      out.push({
        skuId,
        source: "zoho",
        poNumber: String(d.purchaseorder_number ?? po.purchaseorder_number ?? po.purchaseorder_id),
        status: String(d.status ?? po.status ?? "open"),
        openQty: Math.round(remaining),
        expectedDate: d.delivery_date || po.delivery_date || null,
        vendor: d.vendor_name ?? po.vendor_name ?? null,
      });
    }
  }
  return out;
}

export async function readCsvOpenPos(db: DB): Promise<OpenPoLine[]> {
  const rows = await db.select().from(openPosCsv);
  return rows
    .filter((r) => r.openQty > 0)
    .map((r) => ({
      skuId: r.skuId,
      source: "csv" as const,
      poNumber: r.poNumber,
      status: r.status || "open",
      openQty: r.openQty,
      expectedDate: r.expectedDate,
      vendor: null,
    }));
}

/** Everything open, from Zoho and the CSV. A PO number present in both is taken from Zoho. */
export async function collectOpenPos(db: DB) {
  const csv = await readCsvOpenPos(db);
  let zohoLines: OpenPoLine[] = [];
  let note: string | null = null;
  let zohoState: "ok" | "off" | "failed" = "off";
  const connected = isZohoConfigured() && Boolean(await getConnection(db).catch(() => null));
  if (connected) {
    try {
      zohoLines = await readZohoOpenPos(db);
      zohoState = "ok";
    } catch (e) {
      zohoState = "failed";
      note = `Could not read open POs from Zoho: ${(e as Error).message}`;
    }
  }
  const zohoNumbers = new Set(zohoLines.map((l) => l.poNumber));
  const lines = [...zohoLines, ...csv.filter((l) => !zohoNumbers.has(l.poNumber))];

  const parts = [zohoState === "ok" ? "zoho" : zohoState === "failed" ? "zoho_failed" : null, csv.length ? "csv" : null].filter(Boolean);
  const source = parts.length ? parts.join("+") : "none";

  const perSku: Record<string, number> = {};
  for (const l of lines) perSku[l.skuId] = (perSku[l.skuId] ?? 0) + l.openQty;
  return { lines, perSku, source, note };
}
