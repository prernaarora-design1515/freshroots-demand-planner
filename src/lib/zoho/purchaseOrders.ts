import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { decisions, recommendations, skuSuppliers, skus, zohoMap, zohoPushes } from "@/db/schema";
import { getConnection, zoho, ZohoError } from "./client";

type Kind = "vendor" | "item";

async function loadMap(db: DB, orgId: string, kind: Kind) {
  const rows = await db.select().from(zohoMap).where(and(eq(zohoMap.orgId, orgId), eq(zohoMap.kind, kind)));
  return new Map(rows.map((r) => [r.localId, r.zohoId]));
}

async function saveMap(db: DB, orgId: string, kind: Kind, localId: string, zohoId: string) {
  await db
    .insert(zohoMap)
    .values({ kind, localId, zohoId, orgId })
    .onConflictDoUpdate({ target: [zohoMap.kind, zohoMap.localId, zohoMap.orgId], set: { zohoId } });
}

/** Pages through a Zoho list endpoint (200 per page, capped at 10 pages). */
async function listAll(db: DB, path: string, key: string, query: Record<string, string> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await zoho(db, "GET", path, { query: { ...query, page: String(page), per_page: "200" } });
    out.push(...(res[key] ?? []));
    if (!res.page_context?.has_more_page) break;
  }
  return out;
}

/**
 * Makes sure every supplier exists as a Zoho vendor and every SKU as a Zoho item.
 * Re-uses existing records (vendor by exact name, item by SKU) before creating new ones.
 */
export async function syncVendorsAndItems(db: DB, onlySkuIds?: string[]) {
  const conn = await getConnection(db);
  if (!conn) throw new ZohoError("Zoho is not connected.");
  const [supRows, skuRows] = await Promise.all([db.select().from(skuSuppliers), db.select().from(skus)]);
  if (!supRows.length) throw new ZohoError("No supplier mapping loaded. Upload sku_suppliers.csv (or Load sample data) first.");
  const wanted = onlySkuIds ? supRows.filter((s) => onlySkuIds.includes(s.skuId)) : supRows;
  const skuMap = new Map(skuRows.map((s) => [s.skuId, s]));

  const vendorMap = await loadMap(db, conn.orgId, "vendor");
  const itemMap = await loadMap(db, conn.orgId, "item");
  const created = { vendors: 0, items: 0 };
  const linked = { vendors: 0, items: 0 };

  // Vendors
  const suppliers = [...new Map(wanted.map((s) => [s.supplierId, s.supplierName])).entries()];
  const missingVendors = suppliers.filter(([id]) => !vendorMap.has(id));
  if (missingVendors.length) {
    const existing = await listAll(db, "/contacts", "contacts", { contact_type: "vendor" });
    for (const [supplierId, name] of missingVendors) {
      const hit = existing.find((c) => c.contact_name === name && (!c.contact_type || c.contact_type === "vendor"));
      let id: string;
      if (hit) {
        id = String(hit.contact_id);
        linked.vendors++;
      } else {
        const res = await zoho(db, "POST", "/contacts", { body: { contact_name: name, contact_type: "vendor" } });
        id = String(res.contact.contact_id);
        created.vendors++;
      }
      await saveMap(db, conn.orgId, "vendor", supplierId, id);
      vendorMap.set(supplierId, id);
    }
  }

  // Items
  const missingItems = wanted.filter((s) => !itemMap.has(s.skuId));
  if (missingItems.length) {
    const existing = await listAll(db, "/items", "items");
    for (const s of missingItems) {
      const hit = existing.find((i) => i.sku === s.skuId);
      let id: string;
      if (hit) {
        id = String(hit.item_id);
        linked.items++;
      } else {
        const sku = skuMap.get(s.skuId);
        const base = {
          name: sku?.name ?? s.skuId,
          sku: s.skuId,
          unit: "pcs",
          purchase_rate: s.unitCost,
          rate: Math.round(s.unitCost * 1.25 * 100) / 100, // indicative selling price for the demo
          product_type: "goods",
        };
        let res;
        try {
          res = await zoho(db, "POST", "/items", { body: { ...base, item_type: "inventory" } });
        } catch (e) {
          // Organizations without inventory tracking set up reject "inventory" items.
          if (!(e instanceof ZohoError) || e.status === 401) throw e;
          res = await zoho(db, "POST", "/items", { body: { ...base, item_type: "sales_and_purchases" } });
        }
        id = String(res.item.item_id);
        created.items++;
      }
      await saveMap(db, conn.orgId, "item", s.skuId, id);
      itemMap.set(s.skuId, id);
    }
  }

  return { created, linked, vendors: suppliers.length, items: wanted.length, vendorMap, itemMap, orgId: conn.orgId };
}

const istDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/**
 * Sends approved lines (approved or overridden, qty > 0, not yet sent) from one run
 * to Zoho as DRAFT purchase orders, one per supplier. Procurement reviews and issues them in Zoho.
 */
export async function pushRunToZoho(db: DB, runId: number, createdBy?: string) {
  const recs = await db.select().from(recommendations).where(eq(recommendations.runId, runId));
  if (!recs.length) throw new ZohoError(`Run #${runId} not found.`);
  const decs = await db
    .select()
    .from(decisions)
    .where(
      and(
        inArray(decisions.recommendationId, recs.map((r) => r.id)),
        inArray(decisions.status, ["APPROVED", "OVERRIDDEN"]),
        isNull(decisions.zohoPoId),
      ),
    );
  const lines = decs.filter((d) => d.finalQty > 0);
  if (!lines.length) return { runId, purchaseOrders: [], message: "Nothing to send: no approved order lines waiting." };

  const recMap = new Map(recs.map((r) => [r.id, r]));
  const supRows = await db.select().from(skuSuppliers);
  const supMap = new Map(supRows.map((s) => [s.skuId, s]));
  const skuIds = lines.map((d) => recMap.get(d.recommendationId)!.skuId);
  const noSupplier = skuIds.filter((id) => !supMap.has(id));
  if (noSupplier.length)
    throw new ZohoError(`No supplier mapped for ${noSupplier.join(", ")}. Add them to sku_suppliers.csv and upload it.`);

  const { vendorMap, itemMap } = await syncVendorsAndItems(db, skuIds);

  // Group by supplier.
  const groups = new Map<string, typeof lines>();
  for (const d of lines) {
    const sup = supMap.get(recMap.get(d.recommendationId)!.skuId)!;
    if (!groups.has(sup.supplierId)) groups.set(sup.supplierId, []);
    groups.get(sup.supplierId)!.push(d);
  }

  const results: {
    supplier: string;
    poId?: string;
    poNumber?: string;
    status: string;
    lines: number;
    totalQty: number;
    error?: string;
  }[] = [];

  for (const [supplierId, group] of groups) {
    const first = supMap.get(recMap.get(group[0].recommendationId)!.skuId)!;
    const lead = Math.max(...group.map((d) => supMap.get(recMap.get(d.recommendationId)!.skuId)!.leadTimeDays));
    const totalQty = group.reduce((s, d) => s + d.finalQty, 0);
    const body = {
      vendor_id: vendorMap.get(supplierId),
      date: istDate(),
      delivery_date: istDate(new Date(Date.now() + lead * 86_400_000)),
      reference_number: `FR-RUN${runId}`,
      notes: `Draft created by Freshroots Demand Planner from run #${runId}${createdBy ? ` (sent by ${createdBy})` : ""}. Quantities approved by the demand planner, net of open POs; review before issuing.`,
      line_items: group.map((d) => {
        const skuId = recMap.get(d.recommendationId)!.skuId;
        return { item_id: itemMap.get(skuId), quantity: d.finalQty, rate: supMap.get(skuId)!.unitCost };
      }),
    };
    try {
      const res = await zoho(db, "POST", "/purchaseorders", { body });
      const po = res.purchaseorder;
      const poId = String(po.purchaseorder_id);
      const poNumber = String(po.purchaseorder_number ?? poId);
      await db
        .update(decisions)
        .set({ zohoPoId: poId, zohoPoNumber: poNumber })
        .where(inArray(decisions.id, group.map((d) => d.id)));
      await db.insert(zohoPushes).values({
        runId, supplierName: first.supplierName, poId, poNumber, lineCount: group.length, totalQty, status: "created", createdBy,
      });
      results.push({ supplier: first.supplierName, poId, poNumber, status: String(po.status ?? "draft"), lines: group.length, totalQty });
    } catch (e) {
      const msg = (e as Error).message;
      await db.insert(zohoPushes).values({
        runId, supplierName: first.supplierName, lineCount: group.length, totalQty, status: "failed", error: msg, createdBy,
      });
      results.push({ supplier: first.supplierName, status: "failed", lines: group.length, totalQty, error: msg });
    }
  }

  const ok = results.filter((r) => r.status !== "failed").length;
  return {
    runId,
    purchaseOrders: results,
    message: `${ok} draft PO(s) created in Zoho${ok < results.length ? `, ${results.length - ok} failed` : ""}.`,
  };
}
