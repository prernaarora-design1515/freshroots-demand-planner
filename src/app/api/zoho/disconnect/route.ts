import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { disconnect } from "@/lib/zoho/client";

export const dynamic = "force-dynamic";

export async function POST() {
  await disconnect(await getDb());
  return NextResponse.json({ ok: true });
}
