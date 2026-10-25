import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { disconnect } from "@/lib/zoho/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, "admin");
  if (g instanceof NextResponse) return g;
  await disconnect(await getDb());
  return NextResponse.json({ ok: true });
}
