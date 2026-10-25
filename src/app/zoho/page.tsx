import { headers } from "next/headers";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { skuSuppliers, zohoPushes } from "@/db/schema";
import { getConnection, isZohoConfigured, redirectUri, zohoConfig } from "@/lib/zoho/client";
import ZohoActions from "@/components/ZohoActions";

export const dynamic = "force-dynamic";

export default async function ZohoPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { error, connected } = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const cfg = zohoConfig();
  const configured = isZohoConfigured();

  let conn = null;
  let pushes: (typeof zohoPushes.$inferSelect)[] = [];
  let supplierCount = 0;
  let dbError: string | null = null;
  try {
    const db = await getDb();
    conn = await getConnection(db);
    pushes = await db.select().from(zohoPushes).orderBy(desc(zohoPushes.id)).limit(15);
    supplierCount = (await db.select().from(skuSuppliers)).length;
  } catch (e) {
    dbError = (e as Error).message;
  }

  const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) => (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"}`}>
        {done ? "✓" : n}
      </span>
      <div className="text-sm text-gray-700">
        <div className="font-medium text-gray-900">{title}</div>
        {children}
      </div>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Zoho Inventory</h1>
        <p className="mt-1 text-sm text-gray-600">
          Approved reorder lines are sent to Zoho as <b>draft</b> purchase orders, one per supplier. Procurement reviews and issues them in Zoho.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {connected && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Connected to Zoho organization “{connected}”.</p>}
      {dbError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Database not ready: {dbError}</p>}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Status</h2>
        {conn ? (
          <div className="mt-2 text-sm text-gray-700">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Connected to <b>{conn.orgName}</b> (org {conn.orgId}) · since {conn.connectedAt.toLocaleDateString("en-IN")}
            <div className="mt-1 text-xs text-gray-500">API: {conn.apiBase}</div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-gray-700">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-gray-300" />
            Not connected{configured ? "" : " · app keys not set yet"}
          </div>
        )}
        <div className="mt-4">
          <ZohoActions connected={!!conn} configured={configured} supplierCount={supplierCount} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Setup (one time)</h2>
        <ol className="mt-3 space-y-4">
          <Step n={1} done={configured || !!conn} title="Create a Zoho Inventory account and organization">
            Sign up at <a className="text-blue-700 underline" href="https://www.zoho.com/in/inventory/" target="_blank" rel="noreferrer">zoho.com/in/inventory</a> (India data centre) and create a test organization, e.g. “Freshroots (Test)”.
          </Step>
          <Step n={2} done={configured} title="Register an API app in Zoho">
            In <a className="text-blue-700 underline" href={`${cfg.accountsUrl.replace("accounts.", "api-console.")}`} target="_blank" rel="noreferrer">Zoho API Console</a>, choose <b>Server-based Applications</b>:
            <ul className="mt-1 list-disc pl-5">
              <li>Homepage URL: <code className="rounded bg-gray-100 px-1">{origin}</code></li>
              <li>Authorized Redirect URI: <code className="rounded bg-gray-100 px-1">{redirectUri(origin)}</code></li>
            </ul>
          </Step>
          <Step n={3} done={configured} title="Add the app's keys in Vercel, then redeploy">
            Settings → Environment Variables: <code className="rounded bg-gray-100 px-1">ZOHO_CLIENT_ID</code> and <code className="rounded bg-gray-100 px-1">ZOHO_CLIENT_SECRET</code> (Production). Data centre: <code className="rounded bg-gray-100 px-1">{process.env.ZOHO_DC || "in"}</code>.
          </Step>
          <Step n={4} done={!!conn} title="Connect">Click <b>Connect Zoho</b> above and approve access.</Step>
          <Step n={5} done={pushes.length > 0} title="Sync suppliers & items, then send">
            <b>Sync suppliers &amp; items</b> creates the demo suppliers as Zoho vendors and the {supplierCount || ""} SKUs as Zoho items. Then use <b>Send approved to Zoho</b> on the dashboard.
          </Step>
        </ol>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Recent sends</h2>
        {pushes.length ? (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr><th className="py-1.5">When</th><th>Run</th><th>Supplier</th><th>Lines</th><th>Qty</th><th>Result</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pushes.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="py-1.5 text-gray-600">{p.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>#{p.runId}</td>
                  <td>{p.supplierName}</td>
                  <td>{p.lineCount}</td>
                  <td className="tabular-nums">{p.totalQty}</td>
                  <td>{p.status === "created" ? <span className="text-emerald-700">Draft {p.poNumber}</span> : <span className="text-red-700">Failed: {p.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Nothing sent yet.</p>
        )}
      </div>
    </div>
  );
}
