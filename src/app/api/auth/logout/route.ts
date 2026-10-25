import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { endSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await endSession(await getDb());
  return NextResponse.json({ ok: true });
}
