"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ZohoActions({
  connected,
  configured,
  supplierCount,
}: {
  connected: boolean;
  configured: boolean;
  supplierCount: number;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const post = (path: string, done: (j: Record<string, unknown>) => string) =>
    startTransition(async () => {
      setMsg(null);
      const j = await fetch(path, { method: "POST" }).then((r) => r.json());
      setMsg(j.ok ? { ok: true, text: done(j) } : { ok: false, text: String(j.error) });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <a
            href="/api/zoho/connect"
            aria-disabled={!configured}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${configured ? "bg-ink text-white hover:bg-ink/90" : "pointer-events-none bg-gray-200 text-gray-500"}`}
          >
            Connect Zoho
          </a>
        ) : (
          <>
            <button
              disabled={busy || !supplierCount}
              onClick={() =>
                post("/api/zoho/sync", (j) => {
                  const c = j.created as { vendors: number; items: number };
                  const l = j.linked as { vendors: number; items: number };
                  return `Synced: ${c.vendors} vendor(s) and ${c.items} item(s) created; ${l.vendors} vendor(s) and ${l.items} item(s) already in Zoho.`;
                })
              }
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
            >
              {busy ? "Working…" : "Sync suppliers & items"}
            </button>
            <button
              disabled={busy}
              onClick={() => post("/api/zoho/disconnect", () => "Disconnected from Zoho.")}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Disconnect
            </button>
          </>
        )}
      </div>
      {connected && !supplierCount && (
        <p className="text-xs text-amber-700">No supplier mapping loaded yet: upload sku_suppliers.csv or click Load sample data.</p>
      )}
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>
      )}
    </div>
  );
}
