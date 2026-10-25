import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { login } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const p = z.object({ email: z.string().max(200), password: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  const r = await login(await getDb(), p.data.email, p.data.password);
  if (!r.ok) return NextResponse.json(r, { status: 401 });
  return NextResponse.json({ ok: true, user: { name: r.user.name, role: r.user.role } });
}
