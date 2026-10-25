import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { ingest } from "@/lib/ingest";
import { createRun } from "@/lib/runs";
import { SAMPLE_CSVS } from "@/lib/sampleData";
import { SAMPLE_SUPPLIERS_CSV } from "@/lib/sampleSuppliers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Loads the seed CSVs plus the demo supplier mapping (replacing current data) and runs the rules once. */
export async function POST() {
  try {
    const db = await getDb();
    const counts = await ingest(db, { ...SAMPLE_CSVS, sku_suppliers: SAMPLE_SUPPLIERS_CSV });
    const run = await createRun(db);
    return NextResponse.json({ ok: true, counts, run });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
