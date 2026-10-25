import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { currentUser, hasRole } from "@/lib/auth";
import { completeConnection } from "@/lib/zoho/client";

export const dynamic = "force-dynamic";

/** Zoho redirects here after Raghav approves access. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (q: string) => {
    const res = NextResponse.redirect(`${origin}/zoho?${q}`);
    res.cookies.delete({ name: "zoho_oauth_state", path: "/api/zoho" });
    return res;
  };

  if (!hasRole(await currentUser(), "admin")) return back(`error=${encodeURIComponent("Only an admin can connect Zoho.")}`);
  const err = url.searchParams.get("error");
  if (err) return back(`error=${encodeURIComponent(`Zoho declined: ${err}`)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("zoho_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected)
    return back(`error=${encodeURIComponent("Connection expired or was started elsewhere. Click Connect again.")}`);

  try {
    const r = await completeConnection(await getDb(), {
      code,
      origin,
      accountsServer: url.searchParams.get("accounts-server"),
    });
    return back(`connected=${encodeURIComponent(r.orgName)}`);
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
}
