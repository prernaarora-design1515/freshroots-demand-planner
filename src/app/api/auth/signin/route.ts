import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { signInAs } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/** One-click sign-in as Planner, Admin or Viewer. */
export async function POST(req: Request) {
  const p = z.object({ role: z.enum(["admin", "planner", "viewer"]) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "Pick a role." }, { status: 400 });
  return NextResponse.json({ ok: true, user: await signInAs(await getDb(), p.data.role) });
}
