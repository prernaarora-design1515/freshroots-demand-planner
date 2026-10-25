import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { ingest, type CsvBundle } from "@/lib/ingest";
import { FILES, type FileKey } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** multipart/form-data: one field per file key (weekly_sales, sku_master, ...). */
export async function POST(req: Request) {
  const g = await guard(req, "planner");
  if (g instanceof NextResponse) return g;
  try {
    const form = await req.formData();
    const bundle: CsvBundle = {};
    for (const key of Object.keys(FILES) as FileKey[]) {
      const f = form.get(key);
      if (f && typeof f !== "string" && f.size > 0) {
        if (f.size > 10 * 1024 * 1024) throw new Error(`${key}.csv is larger than 10 MB`);
        bundle[key] = await f.text();
      }
    }
    const counts = await ingest(await getDb(), bundle);
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
