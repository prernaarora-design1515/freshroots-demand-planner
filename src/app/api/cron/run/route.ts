import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { runs } from "@/db/schema";
import { createRun } from "@/lib/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called by Vercel Cron every Monday and Thursday at 6:00 am IST (vercel.json).
 * Re-reads open POs from Zoho and runs the rules on the latest uploaded SAP export.
 * Auth: Bearer CRON_SECRET when that variable is set (Vercel sends it automatically);
 * otherwise only Vercel's cron user agent is accepted. Never runs twice within 6 hours.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const ua = req.headers.get("user-agent") ?? "";
  const allowed = secret ? auth === `Bearer ${secret}` : ua.startsWith("vercel-cron/");
  if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 401 });

  const db = await getDb();
  const [last] = await db.select({ createdAt: runs.createdAt }).from(runs).orderBy(desc(runs.id)).limit(1);
  if (last && Date.now() - last.createdAt.getTime() < 6 * 3_600_000)
    return NextResponse.json({ ok: true, skipped: "A run already happened in the last 6 hours." });
  try {
    const run = await createRun(db, { createdBy: "Scheduled run" });
    return NextResponse.json({ ok: true, runId: run.id, flagged: run.flaggedCount });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
