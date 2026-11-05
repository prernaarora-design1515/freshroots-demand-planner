import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { approveRoutine } from "@/lib/decisions";

export const dynamic = "force-dynamic";

/** Approve every undecided routine line of a run; exceptions stay for one-by-one review. */
export async function POST(req: Request) {
  const g = await guard(req, "planner");
  if (g instanceof NextResponse) return g;
  const p = z.object({ runId: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "runId required" }, { status: 400 });
  const approved = await approveRoutine(await getDb(), p.data.runId, { id: g.id, name: g.name });
  return NextResponse.json({ ok: true, approved });
}
