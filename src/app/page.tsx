import Link from "next/link";
import { getDb } from "@/db";
import { latestRun, listRuns, runDetail } from "@/lib/runs";
import { REASON_CODES } from "@/lib/decisions";
import Dashboard from "@/components/Dashboard";
import LoadSampleButton from "@/components/LoadSampleButton";
import { getConnection } from "@/lib/zoho/client";

export const dynamic = "force-dynamic";

async function load(runParam?: string) {
  const db = await getDb();
  const runs = await listRuns(db);
  const runId = runParam ? Number(runParam) : (await latestRun(db))?.id;
  const detail = runId ? await runDetail(db, runId) : null;
  // Zoho tables may not exist until the next migration runs; treat that as "not connected".
  const zohoConnected = Boolean(await getConnection(db).catch(() => null));
  return { runs, detail, zohoConnected };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run: runParam } = await searchParams;

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load(runParam);
  } catch (e) {
    const msg = (e as Error).message;
    const noUrl = msg.includes("DATABASE_URL");
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-xl border border-gray-200 bg-white p-8">
        <h1 className="text-lg font-semibold text-ink">{noUrl ? "Connect the database" : "Database not ready"}</h1>
        {noUrl ? (
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
            <li>In Vercel, open this project → <b>Storage</b> → connect a Neon database (this sets <code>DATABASE_URL</code>), or add <code>DATABASE_URL</code> under Settings → Environment Variables.</li>
            <li>Add <code>GEMINI_API_KEY</code> under Settings → Environment Variables (optional: without it the app shows rule summaries).</li>
            <li>Redeploy. The build creates the tables automatically.</li>
          </ol>
        ) : (
          <p className="mt-2 text-sm text-gray-700">
            The database is connected but the tables may not exist yet. Redeploy so the build runs the migrations.
            <span className="mt-2 block text-xs text-gray-500">Error: {msg}</span>
          </p>
        )}
      </div>
    );
  }

  const { runs, detail, zohoConnected } = data;
  if (!detail) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">No runs yet</h1>
        <p className="mt-2 text-sm text-gray-600">
          Load the Freshroots seed export (15 SKUs, 16 weeks) or upload your own SAP CSVs, then the rules run automatically.
        </p>
        <div className="mt-5 flex items-start justify-center gap-3">
          <LoadSampleButton />
          <Link href="/upload" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
            Upload CSVs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      detail={detail}
      runs={runs.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), flaggedCount: r.flaggedCount }))}
      reasonCodes={REASON_CODES}
      zohoConnected={zohoConnected}
    />
  );
}
