import type { DB } from "@/db";
import { calendar, distributors, inventory, openPosCsv, skuSuppliers, skus, weeklySales } from "@/db/schema";
import { FILES, parseCsv, toInt, type FileKey } from "./csv";

export type CsvBundle = Partial<Record<FileKey, string>>;

const CHUNK = 500;
async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

/**
 * Replaces each table whose CSV is provided. Validates everything before writing,
 * so a bad file never leaves the database half-loaded.
 */
export async function ingest(db: DB, files: CsvBundle) {
  const keys = (Object.keys(files) as FileKey[]).filter((k) => k in FILES && files[k]?.trim());
  if (!keys.length) throw new Error("No CSV files provided");

  const parsed = Object.fromEntries(keys.map((k) => [k, parseCsv(k, files[k]!)])) as Partial<
    Record<FileKey, ReturnType<typeof parseCsv>>
  >;

  const dist = parsed.distributor_master?.map((r) => ({
    distributorId: r.Distributor_ID,
    name: r.Distributor_Name,
    region: r.Region,
    status: r.Status,
  }));
  const sku = parsed.sku_master?.map((r, i) => ({
    skuId: r.SKU_ID,
    name: r.SKU_Name,
    category: r.Category,
    perishability: r.Perishability,
    standardReorderQty: toInt(r.Standard_Reorder_Qty, `sku_master row ${i + 2}`),
    unitOfMeasure: r.Unit_of_Measure,
    distributorId: r.Distributor_ID,
  }));
  const sales = parsed.weekly_sales?.map((r, i) => {
    if (!/^\d{4}-W\d{2}$/.test(r.Week)) throw new Error(`weekly_sales row ${i + 2}: week "${r.Week}" must look like 2026-W42`);
    return { skuId: r.SKU_ID, week: r.Week, unitsSold: toInt(r.Units_Sold, `weekly_sales row ${i + 2}`) };
  });
  const inv = parsed.current_inventory?.map((r, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.As_Of_Date)) throw new Error(`current_inventory row ${i + 2}: date "${r.As_Of_Date}" must be YYYY-MM-DD`);
    return {
      skuId: r.SKU_ID,
      location: r.Location,
      unitsOnHand: toInt(r.Units_On_Hand, `current_inventory row ${i + 2}`),
      asOfDate: r.As_Of_Date,
    };
  });
  const cal = parsed.calendar?.map((r, i) => ({
    yearMonth: r.Year_Month,
    year: toInt(r.Year, `calendar row ${i + 2}`),
    month: toInt(r.Month, `calendar row ${i + 2}`),
    isFestivalMonth: r.Is_Festival_Month.toUpperCase() === "TRUE",
  }));

  const sup = parsed.sku_suppliers?.map((r, i) => {
    const unitCost = Number(r.Unit_Cost);
    if (!Number.isFinite(unitCost) || unitCost <= 0) throw new Error(`sku_suppliers row ${i + 2}: Unit_Cost "${r.Unit_Cost}" must be a positive number`);
    return {
      skuId: r.SKU_ID,
      supplierId: r.Supplier_ID,
      supplierName: r.Supplier_Name,
      unitCost,
      leadTimeDays: toInt(r.Lead_Time_Days, `sku_suppliers row ${i + 2}`),
    };
  });

  const opens = parsed.open_purchase_orders?.map((r, i) => {
    const openQty = toInt(r.Open_Qty, `open_purchase_orders row ${i + 2}`);
    if (openQty < 0) throw new Error(`open_purchase_orders row ${i + 2}: Open_Qty can't be negative`);
    if (!r.PO_Number || !r.SKU_ID) throw new Error(`open_purchase_orders row ${i + 2}: PO_Number and SKU_ID are required`);
    return { poNumber: r.PO_Number, skuId: r.SKU_ID, openQty, expectedDate: r.Expected_Date || null, status: r.Status || null };
  });

  if (dist) { await db.delete(distributors); await insertChunked(dist, (c) => db.insert(distributors).values(c)); }
  if (sku) { await db.delete(skus); await insertChunked(sku, (c) => db.insert(skus).values(c)); }
  if (sales) { await db.delete(weeklySales); await insertChunked(sales, (c) => db.insert(weeklySales).values(c)); }
  if (inv) { await db.delete(inventory); await insertChunked(inv, (c) => db.insert(inventory).values(c)); }
  if (cal) { await db.delete(calendar); await insertChunked(cal, (c) => db.insert(calendar).values(c)); }
  if (sup) { await db.delete(skuSuppliers); await insertChunked(sup, (c) => db.insert(skuSuppliers).values(c)); }
  if (opens) { await db.delete(openPosCsv); await insertChunked(opens, (c) => db.insert(openPosCsv).values(c)); }

  return Object.fromEntries(keys.map((k) => [k, parsed[k]!.length])) as Record<FileKey, number>;
}
