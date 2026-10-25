import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { guard } from "@/lib/auth";
import { syncVendorsAndItems } from "@/lib/zoho/purchaseOrders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Creates (or links) the demo suppliers as Zoho vendors and the SKUs as Zoho items. */
export async function POST(req: Request) {
  const g = await guard(req, "admin");
  if (g instanceof NextResponse) return g;
  try {
    const r = await syncVendorsAndItems(await getDb());
    return NextResponse.json({ ok: true, created: r.created, linked: r.linked, vendors: r.vendors, items: r.items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
