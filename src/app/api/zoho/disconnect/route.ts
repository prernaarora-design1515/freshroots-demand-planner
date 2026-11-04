import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { demoMode } from "@/lib/demo";
import { disconnect } from "@/lib/zoho/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, "admin");
  if (g instanceof NextResponse) return g;
  if (demoMode())
    return NextResponse.json({ ok: false, error: "Disconnect is turned off in the demo so the Zoho link stays live for every reviewer." }, { status: 403 });
  await disconnect(await getDb());
  return NextResponse.json({ ok: true });
}
