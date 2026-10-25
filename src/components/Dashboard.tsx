"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DashboardRow, RunDetail } from "@/lib/runs";

type ReasonCodes = Record<string, string>;
type RunSummary = { id: number; createdAt: string; flaggedCount: number };

const ACTION_STYLE: Record<string, { label: string; cls: string }> = {
  REORDER_NOW: { label: "Reorder now", cls: "bg-red-50 text-red-700 ring-red-200" },
  REORDER: { label: "Reorder", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  COVERED: { label: "Covered by open PO", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  REVIEW: { label: "Needs review", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  PAUSE: { label: "Pause order", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  NO_ACTION: { label: "No action", cls: "bg-gray-50 text-gray-500 ring-gray-200" },
};
const FLAG_LABEL: Record<string, string> = {
  HIGH_DEMAND: "High demand",
  STOCKOUT_RISK: "Stockout risk",
  OVERSTOCK_RISK: "Overstock risk",
};

const OPEN_PO_SOURCE: Record<string, string> = {
  zoho: "read from Zoho",
  csv: "from uploaded CSV",
  "zoho+csv": "read from Zoho + uploaded CSV",
  zoho_failed: "Zoho read failed",
  "zoho_failed+csv": "Zoho read failed; CSV used",
  none: "none found (Zoho not connected, no CSV)",
};

const fmtDate = (iso: string) =>
  // Fixed to IST so server- and browser-rendered times always match.
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Dashboard({
  detail,
  runs,
  reasonCodes,
  zohoConnected = false,
  canAct = false,
  signedIn = false,
}: {
  detail: RunDetail;
  runs: RunSummary[];
  reasonCodes: ReasonCodes;
  zohoConnected?: boolean;
  canAct?: boolean;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const { run, rows } = detail;
  const [view, setView] = useState<"flagged" | "all">("flagged");
  const [distributor, setDistributor] = useState("");
  const [region, setRegion] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [zohoMsg, setZohoMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const distributors = useMemo(() => [...new Set(rows.map((r) => r.distributorName))].sort(), [rows]);
  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))].sort(), [rows]);

  const flagged = rows.filter((r) => r.action !== "NO_ACTION");
  const decided = flagged.filter((r) => r.decision).length;
  const unitsApproved = rows.reduce(
    (s, r) => s + (r.decision && r.decision.status !== "REJECTED" ? r.decision.finalQty : 0),
    0,
  );
  const openUnitsNetted = rows.reduce((s, r) => s + (r.grossQty - r.recommendedQty), 0);
  const overrides = rows.filter((r) => r.decision?.status === "OVERRIDDEN" || r.decision?.status === "REJECTED").length;

  const visible = rows.filter(
    (r) =>
      (view === "all" || r.action !== "NO_ACTION") &&
      (!distributor || r.distributorName === distributor) &&
      (!region || r.region === region) &&
      (!pendingOnly || (!r.decision && r.action !== "NO_ACTION")),
  );

  const rerun = () =>
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/runs", { method: "POST" });
      const json = await res.json();
      if (!json.ok) return setError(json.error);
      router.push(`/?run=${json.run.id}`);
      router.refresh();
    });

  const toSend = rows.filter(
    (r) => r.decision && r.decision.status !== "REJECTED" && r.decision.finalQty > 0 && !r.decision.zohoPoNumber,
  ).length;

  const sendToZoho = () =>
    startTransition(async () => {
      setZohoMsg(null);
      const j = await fetch("/api/zoho/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      }).then((r) => r.json());
      if (!j.ok) return setZohoMsg({ ok: false, text: j.error });
      const failed = (j.purchaseOrders as { status: string; supplier: string; error?: string }[]).filter((p) => p.status === "failed");
      setZohoMsg({
        ok: failed.length === 0,
        text: j.message + (failed.length ? " " + failed.map((f) => `${f.supplier}: ${f.error}`).join(" · ") : ""),
      });
      router.refresh();
    });

  const isLatest = runs[0]?.id === run.id;

  return (
    <div className="space-y-5">
      {/* Run header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reorder recommendations</h1>
          <p className="mt-1 text-sm text-gray-600">
            Run #{run.id} · {fmtDate(run.createdAt)} · stock as of {run.asOfDate} · sales to {run.latestWeek}
            {run.isFestival && (
              <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                Festival month · +25% demand
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Open POs: {OPEN_PO_SOURCE[run.openPoSource] ?? run.openPoSource}
            {detail.openPoLineCount > 0 && ` · ${detail.openPoLineCount} open line(s) netted off`}
            {run.createdBy && ` · run by ${run.createdBy}`}
          </p>
          {run.openPoNote && <p className="mt-1 text-xs text-red-700">{run.openPoNote}. Quantities were not netted for Zoho POs.</p>}
          {run.aiStatus !== "ok" && (
            <p className="mt-1 text-xs text-gray-500">
              {run.aiStatus === "failed"
                ? "Gemini explanations failed for this run. Showing rule summaries instead."
                : run.aiStatus === "skipped"
                  ? "AI explanations off (no GEMINI_API_KEY). Showing rule summaries."
                  : "AI explanations pending."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runs.length > 1 && (
            <select
              value={run.id}
              onChange={(e) => router.push(`/?run=${e.target.value}`)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
              aria-label="Choose run"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  Run #{r.id} · {fmtDate(r.createdAt)}
                </option>
              ))}
            </select>
          )}
          {canAct && (
          <button
            onClick={rerun}
            disabled={busy}
            title="Re-reads open POs from Zoho and runs the rules on the current data"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? "Running…" : "Re-run rules"}
          </button>
          )}
          {!canAct ? null : zohoConnected ? (
            <button
              onClick={sendToZoho}
              disabled={busy || toSend === 0}
              title={toSend === 0 ? "Approve or override lines first" : "Creates draft purchase orders in Zoho, one per supplier"}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
            >
              {busy ? "Working…" : `Send approved to Zoho${toSend ? ` (${toSend})` : ""}`}
            </button>
          ) : (
            <a href="/zoho" className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Connect Zoho
            </a>
          )}
          {signedIn ? (
            <a
              href={`/api/runs/${run.id}/export`}
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90"
            >
              Download approved list (CSV)
            </a>
          ) : (
            <a href="/login" className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90">
              Sign in to act
            </a>
          )}
        </div>
      </div>
      {!isLatest && (
        <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">You are viewing an older run.</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {zohoMsg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${zohoMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {zohoMsg.text} {zohoMsg.ok && <a href="/zoho" className="underline">See Zoho sends</a>}
        </p>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Tile label="Reorder now" value={rows.filter((r) => r.action === "REORDER_NOW").length} tone="text-red-700" />
        <Tile
          label="Covered by open POs"
          value={rows.filter((r) => r.action === "COVERED").length}
          tone="text-emerald-700"
          sub={openUnitsNetted ? `${openUnitsNetted.toLocaleString("en-IN")} units not re-ordered` : undefined}
        />
        <Tile label="Pause order" value={rows.filter((r) => r.action === "PAUSE").length} tone="text-sky-700" />
        <Tile label="Needs review / borderline" value={rows.filter((r) => r.needsJudgment || r.borderline).length} tone="text-violet-700" />
        <Tile label="Decided" value={`${decided} / ${flagged.length}`} sub={overrides ? `${overrides} override(s)` : undefined} />
        <Tile label="Units approved to order" value={unitsApproved.toLocaleString("en-IN")} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm">
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
          {(["flagged", "all"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 ${view === v ? "bg-white font-medium shadow-sm" : "text-gray-600"}`}
            >
              {v === "flagged" ? `Flagged (${flagged.length})` : `All SKUs (${rows.length})`}
            </button>
          ))}
        </div>
        <select value={distributor} onChange={(e) => setDistributor(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
          <option value="">All distributors</option>
          {distributors.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
          <option value="">All regions</option>
          {regions.map((r) => <option key={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 text-gray-700">
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
          Awaiting my decision
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Distributor</th>
              <th className="px-3 py-2.5">Last 12 wks</th>
              <th className="px-3 py-2.5 text-right">4-wk vs 12-wk</th>
              <th className="px-3 py-2.5">Weeks of cover</th>
              <th className="px-3 py-2.5">Recommendation</th>
              <th className="px-3 py-2.5 w-[28%]">Why</th>
              <th className="px-3 py-2.5 w-[16%]">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((r) => (
              <Row key={r.id} r={r} reasonCodes={reasonCodes} canAct={canAct} />
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-500">Nothing matches these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Quantities come from Raghav&apos;s documented rules; AI only writes the explanation. Units already on open or draft
        POs (read from Zoho at each run, plus any uploaded open_purchase_orders.csv) are subtracted from the order; the
        flags still use stock on hand. Nothing reaches procurement until a planner approves it here; approved lines go to
        Zoho as draft POs that procurement issues.
      </p>
    </div>
  );
}

function Tile({ label, value, sub, tone = "text-ink" }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Sparkline({ data }: { data: { week: string; units: number }[] }) {
  if (data.length < 2) return <span className="text-gray-400">–</span>;
  const w = 96, h = 28;
  const vals = data.map((d) => d.units);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`);
  const last4Start = (Math.max(0, vals.length - 4) / (vals.length - 1)) * w;
  return (
    <svg width={w} height={h} className="overflow-visible" role="img" aria-label={`Weekly sales ${data[0].week} to ${data.at(-1)!.week}`}>
      <title>{data.map((d) => `${d.week}: ${d.units}`).join("\n")}</title>
      <rect x={last4Start} y={0} width={w - last4Start} height={h} className="fill-gray-100" />
      <polyline points={pts.join(" ")} fill="none" stroke="#13294b" strokeWidth={1.5} />
    </svg>
  );
}

function CoverBar({ value, min, max }: { value: number; min: number; max: number }) {
  const scaleMax = Math.max(max * 1.6, value * 1.05);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  const color = value < min ? "bg-red-500" : value > max ? "bg-sky-500" : "bg-emerald-500";
  return (
    <div className="w-32">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{value >= 999 ? "∞" : value} wks</span>
        <span className="text-gray-500">target {min}–{max}</span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-gray-100">
        <div className="absolute h-1.5 rounded-full bg-emerald-100" style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }} />
        <div className={`absolute -top-0.5 h-2.5 w-1 rounded ${color}`} style={{ left: pct(value) }} />
      </div>
    </div>
  );
}

function Row({ r, reasonCodes, canAct }: { r: DashboardRow; reasonCodes: ReasonCodes; canAct: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "override" | "reject">("idle");
  const [qty, setQty] = useState(String(r.recommendedQty));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const style = ACTION_STYLE[r.action];

  const submit = (status: "APPROVED" | "OVERRIDDEN" | "REJECTED") =>
    startTransition(async () => {
      setErr(null);
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId: r.id,
          status,
          finalQty: status === "OVERRIDDEN" ? Number(qty) : r.recommendedQty,
          reasonCode: status === "APPROVED" ? null : reason || null,
          note: note || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) return setErr(json.error);
      setMode("idle");
      router.refresh();
    });

  const undo = () =>
    startTransition(async () => {
      const j = await fetch(`/api/decisions?recommendationId=${r.id}`, { method: "DELETE" }).then((x) => x.json());
      if (!j.ok) return setErr(j.error);
      router.refresh();
    });

  return (
    <tr className={`align-top ${r.action === "NO_ACTION" ? "text-gray-500" : ""}`}>
      <td className="px-3 py-3">
        <div className="font-medium text-gray-900">{r.skuName.replace(/^Freshroots /, "")}</div>
        <div className="text-xs text-gray-500">
          {r.skuId} · {r.category}
          {r.perishability === "High" && <span className="ml-1 rounded bg-rose-50 px-1 text-rose-700">perishable</span>}
        </div>
      </td>
      <td className="px-3 py-3">
        <div>{r.distributorName}</div>
        <div className="text-xs text-gray-500">{r.region}</div>
        {r.supplierName && <div className="mt-1 text-[11px] text-gray-400">Buys from {r.supplierName}</div>}
      </td>
      <td className="px-3 py-3"><Sparkline data={r.history} /></td>
      <td className="px-3 py-3 text-right tabular-nums">
        <div className={r.flags.includes("HIGH_DEMAND") ? "font-semibold text-amber-700" : ""}>
          {r.demandLiftPct > 0 ? "+" : ""}{r.demandLiftPct}%
        </div>
        <div className="text-xs text-gray-500">{r.avg4} vs {r.avg12}/wk</div>
      </td>
      <td className="px-3 py-3"><CoverBar value={r.weeksOfCover} min={r.minWeeks} max={r.maxWeeks} /></td>
      <td className="px-3 py-3">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style.cls}`}>{style.label}</span>
        {r.recommendedQty > 0 && <div className="mt-1 font-semibold tabular-nums text-gray-900">{r.recommendedQty} units</div>}
        {r.openPoQty > 0 && (
          <div className="mt-1 rounded bg-emerald-50 px-1.5 py-1 text-[11px] leading-snug text-emerald-900">
            {r.grossQty > 0 ? (
              <>Rules {r.grossQty} − open POs {r.openPoQty} = <b>{r.recommendedQty}</b></>
            ) : (
              <>{r.openPoQty} units on open POs</>
            )}
            <div className="text-emerald-800/80">
              {r.openPos.map((o) => `${o.poNumber} (${o.status}${o.source === "csv" ? ", CSV" : ""}) ${o.openQty}`).join(" · ")}
            </div>
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {r.flags.map((f) => (
            <span key={f} className="text-[11px] text-gray-500">{FLAG_LABEL[f]}</span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="leading-snug text-gray-700">{r.aiExplanation ?? r.ruleSummary}</p>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">{r.aiExplanation ? "Gemini explanation" : "Rule summary"}</div>
        {r.borderline && (
          <p className="mt-1.5 rounded bg-violet-50 px-2 py-1 text-xs text-violet-800">Borderline: {r.borderline}</p>
        )}
      </td>
      <td className="px-3 py-3">
        {r.action === "NO_ACTION" ? (
          <span className="text-xs text-gray-400">–</span>
        ) : r.decision ? (
          <div className="text-xs">
            <div className={`font-semibold ${r.decision.status === "APPROVED" ? "text-emerald-700" : r.decision.status === "REJECTED" ? "text-gray-600" : "text-amber-700"}`}>
              {r.decision.status === "APPROVED" ? "Approved" : r.decision.status === "REJECTED" ? "Rejected" : "Overridden"}
              {r.decision.status !== "REJECTED" &&
                (r.action === "PAUSE" && r.decision.finalQty === 0
                  ? " · hold next order"
                  : r.action === "COVERED" && r.decision.finalQty === 0
                    ? " · no new order"
                    : ` · ${r.decision.finalQty} units`)}
            </div>
            <div className="text-gray-500">by {r.decision.decidedBy}</div>
            {r.decision.reasonCode && <div className="text-gray-600">{reasonCodes[r.decision.reasonCode] ?? r.decision.reasonCode}</div>}
            {r.decision.note && <div className="italic text-gray-500">“{r.decision.note}”</div>}
            {r.decision.zohoPoNumber || !canAct ? (
              r.decision.zohoPoNumber && (
              <div className="mt-1 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 ring-1 ring-emerald-200">
                In Zoho · draft {r.decision.zohoPoNumber}
              </div>
              )
            ) : (
              <button onClick={undo} disabled={busy} className="mt-1 text-gray-500 underline hover:text-gray-800">Undo</button>
            )}
            {err && <div className="text-red-600">{err}</div>}
          </div>
        ) : !canAct ? (
          <a href="/login" className="text-xs text-gray-500 underline">Sign in to decide</a>
        ) : mode === "idle" ? (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => submit("APPROVED")} disabled={busy} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {r.action === "COVERED" ? "Confirm (no order)" : "Approve"}
            </button>
            <button onClick={() => setMode("override")} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50">Override</button>
            <button onClick={() => setMode("reject")} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50">Reject</button>
          </div>
        ) : (
          <div className="space-y-1.5 text-xs">
            {mode === "override" && (
              <label className="block">
                Final qty
                <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" />
              </label>
            )}
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded border border-gray-300 px-1.5 py-1">
              <option value="">Reason…</option>
              {Object.entries(reasonCodes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1" />
            {err && <div className="text-red-600">{err}</div>}
            <div className="flex gap-1.5">
              <button onClick={() => submit(mode === "override" ? "OVERRIDDEN" : "REJECTED")} disabled={busy} className="rounded-md bg-ink px-2.5 py-1 font-medium text-white disabled:opacity-50">
                Save
              </button>
              <button onClick={() => { setMode("idle"); setErr(null); }} className="rounded-md border border-gray-300 px-2.5 py-1">Cancel</button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
