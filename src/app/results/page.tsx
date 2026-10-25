import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { currentUser, loginRequiredToView } from "@/lib/auth";
import { loadResults, PLAN } from "@/lib/results";
import RunBars from "@/components/RunBars";

export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const STATUS = {
  "on-track": { label: "On track", icon: "✓", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  "off-track": { label: "Off track", icon: "!", cls: "bg-red-50 text-red-700 ring-red-200" },
  "no-data": { label: "Not enough data yet", icon: "…", cls: "bg-gray-50 text-gray-600 ring-gray-200" },
} as const;

export default async function ResultsPage() {
  if (!(await currentUser()) && loginRequiredToView()) redirect("/login");
  let r;
  try {
    r = await loadResults(await getDb());
  } catch (e) {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Database not ready: {(e as Error).message}</p>;
  }
  if (!r)
    return (
      <p className="mx-auto mt-10 max-w-md rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
        No runs yet. Results start on the day of the first run. <Link href="/" className="underline">Go to the dashboard</Link>.
      </p>
    );

  const pct = Math.round((r.dayOfPlan / PLAN.days) * 100);
  const trendLabel = (t: (typeof r.trend)[number]) => ({
    label: `#${t.runId}`,
    sub: `stock as of ${t.asOfDate}`,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">90-day results</h1>
          <p className="mt-1 text-sm text-gray-600">
            Measured from the first run ({new Date(r.start).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}) against Deepa&apos;s baseline.
          </p>
        </div>
        <div className="w-64">
          <div className="flex justify-between text-xs text-gray-600"><span>Day {r.dayOfPlan} of {PLAN.days}</span><span>{r.runCount} runs</span></div>
          <div className="mt-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-ink" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {r.distinctSnapshots < 2 && (
        <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
          All {r.runCount} run(s) use the same stock snapshot, so stockout and write-off exposure can&apos;t move yet. They start
          to change once a new SAP export (current_inventory + weekly_sales) is uploaded, e.g. every Monday and Thursday.
        </p>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {r.scorecard.map((m) => {
          const st = STATUS[m.status as keyof typeof STATUS];
          return (
            <div key={m.key} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-gray-600">{m.label}</div>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${st.cls}`}>
                  <span aria-hidden>{st.icon}</span> {st.label}
                </span>
              </div>
              <div className="mt-1 text-2xl font-semibold text-ink">{m.value}</div>
              <div className="text-xs text-gray-500">{m.detail}</div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-gray-500">Before</dt><dd className="text-gray-700">{m.baseline}</dd>
                <dt className="text-gray-500">Target</dt><dd className="text-gray-700">{m.target}</dd>
              </dl>
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <RunBars title="Stockout exposure per run (units short of minimum cover × unit cost)" fmt={inr} data={r.trend.map((t) => ({ ...trendLabel(t), value: t.stockoutValue }))} />
        <RunBars title="Perishable excess per run (units above maximum cover × unit cost)" fmt={inr} data={r.trend.map((t) => ({ ...trendLabel(t), value: t.excessValue }))} />
      </section>

      <details className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium text-gray-900">Table view of every run</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr><th className="py-1.5">Run</th><th>Stock as of</th><th>SKUs below min</th><th>Short (units)</th><th>Stockout exposure</th><th>Perishables above max</th><th>Excess (units)</th><th>Excess value</th><th>At zero stock</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 tabular-nums">
              {r.trend.map((t) => (
                <tr key={t.runId}>
                  <td className="py-1.5"><Link href={`/?run=${t.runId}`} className="underline">#{t.runId}</Link></td>
                  <td>{t.asOfDate}</td><td>{t.stockoutSkus}</td><td>{t.stockoutUnits}</td><td>{inr(t.stockoutValue)}</td>
                  <td>{t.perishableExcessSkus}</td><td>{t.excessUnits}</td><td>{inr(t.excessValue)}</td><td>{t.zeroStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Why planners overrode the rules</h2>
          <p className="text-xs text-gray-500">This is the 15–20% Raghav handles on judgment. Repeated reasons are candidates for new rules.</p>
          {r.decisions.reasons.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {r.decisions.reasons.map((x) => (
                <li key={x.code}>
                  <div className="flex justify-between"><span>{x.label}</span><span className="tabular-nums text-gray-600">{x.n}</span></div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-gray-100">
                    <div className="h-1.5 rounded-full bg-ink" style={{ width: `${(x.n / r.decisions.reasons[0].n) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No overrides or rejections yet.</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Decisions by planner</h2>
          <p className="text-xs text-gray-500">Latest run #{r.latestRunId}: {r.decisions.latestDecided} of {r.decisions.latestFlagged} flagged lines decided.</p>
          {r.decisions.byPlanner.length ? (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-1">Planner</th><th>Decided</th><th>Override rate</th></tr></thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                {r.decisions.byPlanner.map((p) => (
                  <tr key={p.name}><td className="py-1">{p.name}</td><td>{p.decided}</td><td>{Math.round((p.overridden / p.decided) * 100)}%</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No decisions yet.</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Orders</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-gray-600">Draft POs created in Zoho</dt><dd className="tabular-nums">{r.ordering.posCreated}{r.ordering.pushFailures ? ` (${r.ordering.pushFailures} failed)` : ""}</dd>
            <dt className="text-gray-600">Lines / units sent</dt><dd className="tabular-nums">{r.ordering.linesSent} / {r.ordering.unitsSent.toLocaleString("en-IN")}</dd>
            <dt className="text-gray-600">Value sent (at cost)</dt><dd className="tabular-nums">{inr(r.ordering.valueSent)}</dd>
            <dt className="text-gray-600">Not re-ordered thanks to open POs (latest run)</dt><dd className="tabular-nums">{r.ordering.nettedLatest.toLocaleString("en-IN")} units · {inr(r.ordering.nettedValueLatest)}</dd>
          </dl>
        </div>
      </section>

      <p className="text-xs text-gray-500">
        Exposure is a leading indicator computed from each stock snapshot at unit cost (from sku_suppliers); it is not the
        lost-sales or write-off figure finance reports. At day 90, compare it with finance&apos;s actual stockout and write-off
        numbers for the quarter.{r.missingCost ? ` ${r.missingCost} SKU(s) have no unit cost and count as ₹0.` : ""}
      </p>
    </div>
  );
}
