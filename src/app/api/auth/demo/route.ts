import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { demoMode, demoSignIn } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** One-click sign-in as a demo Admin, Planner or Viewer (only while demo mode is on). */
export async function POST(req: Request) {
  if (!demoMode()) return NextResponse.json({ ok: false, error: "Demo sign-in is turned off." }, { status: 404 });
  const p = z.object({ role: z.enum(["admin", "planner", "viewer"]) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "Pick a role." }, { status: 400 });
  return NextResponse.json({ ok: true, user: await demoSignIn(await getDb(), p.data.role) });
}
