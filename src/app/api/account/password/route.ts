import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, "viewer");
  if (g instanceof NextResponse) return g;
  const p = z.object({ current: z.string().max(200), next: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "Current and new password are required." }, { status: 400 });
  try {
    await changeOwnPassword(await getDb(), g.id, p.data.current, p.data.next);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
