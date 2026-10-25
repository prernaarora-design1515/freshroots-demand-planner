import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { createUser, listUsers, newUserInput, updateUser, updateUserInput } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req, "admin");
  if (g instanceof NextResponse) return g;
  return NextResponse.json({ ok: true, users: await listUsers(await getDb()) });
}

/** Admin adds a user with a temporary password they share with that person. */
export async function POST(req: Request) {
  const g = await guard(req, "admin");
  if (g instanceof NextResponse) return g;
  const p = newUserInput.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, user: await createUser(await getDb(), p.data) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

/** Change role, (de)activate, rename or reset password. */
export async function PATCH(req: Request) {
  const g = await guard(req, "admin");
  if (g instanceof NextResponse) return g;
  const p = updateUserInput.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    await updateUser(await getDb(), g.id, p.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
