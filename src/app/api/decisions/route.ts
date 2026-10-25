import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { decisionInput, saveDecision, undoDecision } from "@/lib/decisions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, "planner");
  if (g instanceof NextResponse) return g;
  const parsed = decisionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, decision: await saveDecision(await getDb(), parsed.data, { id: g.id, name: g.name }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const g = await guard(req, "planner");
  if (g instanceof NextResponse) return g;
  const id = Number(new URL(req.url).searchParams.get("recommendationId"));
  if (!Number.isInteger(id)) return NextResponse.json({ ok: false, error: "recommendationId required" }, { status: 400 });
  try {
    await undoDecision(await getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
