import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { pushRunToZoho } from "@/lib/zoho/purchaseOrders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sends a run's approved lines to Zoho as draft purchase orders (one per supplier). */
export async function POST(req: Request) {
  const g = await guard(req, "planner");
  if (g instanceof NextResponse) return g;
  const parsed = z.object({ runId: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "runId required" }, { status: 400 });
  try {
    const r = await pushRunToZoho(await getDb(), parsed.data.runId, g.name);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
