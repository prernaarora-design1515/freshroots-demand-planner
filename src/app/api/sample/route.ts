import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { ingest } from "@/lib/ingest";
import { createRun } from "@/lib/runs";
import { SAMPLE_CSVS } from "@/lib/sampleData";
import { SAMPLE_SUPPLIERS_CSV } from "@/lib/sampleSuppliers";
import { NEXT_WEEK_CSVS } from "@/lib/sampleNextWeek";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Loads sample data (replacing current data) and runs the rules once.
 * body { set: "seed" } (default): the case's seed export, stock as of 19 Oct.
 * body { set: "next-week" }: an illustrative export one week later (data/next_week/README.md).
 */
export async function POST(req: Request) {
  const g = await guard(req, "planner");
  if (g instanceof NextResponse) return g;
  try {
    const db = await getDb();
    const body = await req.json().catch(() => ({}));
    const bundle = body?.set === "next-week" ? { ...SAMPLE_CSVS, ...NEXT_WEEK_CSVS } : { ...SAMPLE_CSVS, sku_suppliers: SAMPLE_SUPPLIERS_CSV };
    const counts = await ingest(db, bundle);
    const run = await createRun(db, { createdBy: g.name });
    return NextResponse.json({ ok: true, counts, run });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
