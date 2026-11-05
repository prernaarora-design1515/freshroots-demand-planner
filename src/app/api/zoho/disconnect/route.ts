import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { zohoDisconnectAllowed } from "@/lib/accounts";
import { disconnect } from "@/lib/zoho/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, "admin");
  if (g instanceof NextResponse) return g;
  if (!zohoDisconnectAllowed())
    return NextResponse.json({ ok: false, error: "Disconnect is turned off so the Zoho link stays live for every reviewer." }, { status: 403 });
  await disconnect(await getDb());
  return NextResponse.json({ ok: true });
}
