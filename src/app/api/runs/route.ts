import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { createRun, listRuns } from "@/lib/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(await listRuns(await getDb()));
}

export async function POST(req: Request) {
  const g = await guard(req, "planner");
  if (g instanceof NextResponse) return g;
  try {
    const run = await createRun(await getDb(), { createdBy: g.name });
    return NextResponse.json({ ok: true, run });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
