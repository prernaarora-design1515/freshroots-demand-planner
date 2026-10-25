import Papa from "papaparse";

/** The SAP export files (plus the supplier mapping), with the columns each must have. */
export const FILES = {
  weekly_sales: ["SKU_ID", "Week", "Units_Sold"],
  sku_master: ["SKU_ID", "SKU_Name", "Category", "Perishability", "Standard_Reorder_Qty", "Unit_of_Measure", "Distributor_ID"],
  distributor_master: ["Distributor_ID", "Distributor_Name", "Region", "Status"],
  current_inventory: ["SKU_ID", "Location", "Units_On_Hand", "As_Of_Date"],
  calendar: ["Year", "Month", "Year_Month", "Is_Festival_Month"],
  sku_suppliers: ["SKU_ID", "Supplier_ID", "Supplier_Name", "Unit_Cost", "Lead_Time_Days"],
  // Optional: open POs that are not in Zoho. Expected_Date and Status columns are optional.
  open_purchase_orders: ["PO_Number", "SKU_ID", "Open_Qty"],
} as const;

export type FileKey = keyof typeof FILES;
export type Row = Record<string, string>;

export function parseCsv(key: FileKey, text: string): Row[] {
  const res = Papa.parse<Row>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  if (res.errors.length) throw new Error(`${key}.csv: ${res.errors[0].message} (row ${res.errors[0].row})`);
  const missing = FILES[key].filter((c) => !res.meta.fields?.includes(c));
  if (missing.length) throw new Error(`${key}.csv is missing column(s): ${missing.join(", ")}`);
  return res.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? "").trim()])));
}

export function toInt(v: string, ctx: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${ctx}: "${v}" is not a number`);
  return Math.round(n);
}

export function toCsv(rows: Record<string, string | number | null>[]): string {
  return Papa.unparse(rows);
}
