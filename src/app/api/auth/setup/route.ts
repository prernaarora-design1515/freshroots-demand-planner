import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { startSession } from "@/lib/auth";
import { setupFirstAdmin, setupInput } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Creates the first admin (only while there are no users, and only with SETUP_CODE). */
export async function POST(req: Request) {
  const p = setupInput.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const db = await getDb();
    const u = await setupFirstAdmin(db, p.data);
    await startSession(db, u.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
