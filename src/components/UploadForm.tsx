"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import LoadSampleButton from "@/components/LoadSampleButton";

const FILES: { key: string; label: string; hint: string }[] = [
  { key: "weekly_sales", label: "weekly_sales.csv", hint: "SKU_ID, Week (2026-W42), Units_Sold" },
  { key: "current_inventory", label: "current_inventory.csv", hint: "SKU_ID, Location, Units_On_Hand, As_Of_Date" },
  { key: "sku_master", label: "sku_master.csv", hint: "SKU_ID, SKU_Name, Category, Perishability, Standard_Reorder_Qty, …" },
  { key: "distributor_master", label: "distributor_master.csv", hint: "Distributor_ID, Distributor_Name, Region, Status" },
  { key: "calendar", label: "calendar.csv", hint: "Year, Month, Year_Month, Is_Festival_Month" },
  { key: "sku_suppliers", label: "sku_suppliers.csv", hint: "SKU_ID, Supplier_ID, Supplier_Name, Unit_Cost, Lead_Time_Days (needed for Zoho POs)" },
  { key: "open_purchase_orders", label: "open_purchase_orders.csv (optional)", hint: "PO_Number, SKU_ID, Open_Qty, [Expected_Date, Status]: open POs not in Zoho; upload a header-only file to clear" },
];

export default function UploadForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const run = form.get("run") === "on";
    startTransition(async () => {
      setMsg(null);
      const up = await fetch("/api/upload", { method: "POST", body: form }).then((r) => r.json());
      if (!up.ok) return setMsg({ ok: false, text: up.error });
      const loaded = Object.entries(up.counts).map(([k, n]) => `${k}: ${n} rows`).join(" · ");
      if (!run) return setMsg({ ok: true, text: `Loaded ${loaded}` });
      const res = await fetch("/api/runs", { method: "POST" }).then((r) => r.json());
      if (!res.ok) return setMsg({ ok: false, text: `Loaded ${loaded}, but the run failed: ${res.error}` });
      router.push(`/?run=${res.run.id}`);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-ink">Upload SAP export</h1>
      <p className="mt-1 text-sm text-gray-600">
        Upload any of these files. Each file you upload replaces that table; files you leave empty keep their current data.
      </p>
      <form onSubmit={onSubmit} className="mt-5 space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        {FILES.map((f) => (
          <label key={f.key} className="block">
            <span className="text-sm font-medium text-gray-800">{f.label}</span>
            <span className="ml-2 text-xs text-gray-500">{f.hint}</span>
            <input name={f.key} type="file" accept=".csv,text/csv" className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5" />
          </label>
        ))}
        <label className="flex items-center gap-2 pt-2 text-sm">
          <input type="checkbox" name="run" defaultChecked /> Run the rules straight after uploading
        </label>
        {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
        <button disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Working…" : "Upload"}
        </button>
      </form>
      <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-5">
        <p className="text-sm text-gray-600">No files handy? Reload the Freshroots seed export (replaces current data) and run the rules.</p>
        <LoadSampleButton variant="secondary" />
      </div>
    </div>
  );
}
