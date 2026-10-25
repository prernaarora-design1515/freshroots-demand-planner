import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { currentUser, hasRole } from "@/lib/auth";
import { authorizeUrl, isZohoConfigured } from "@/lib/zoho/client";

export const dynamic = "force-dynamic";

/** Starts the Zoho OAuth flow. A random state in a short-lived cookie guards the callback. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!hasRole(await currentUser(), "admin"))
    return NextResponse.redirect(`${origin}/zoho?error=${encodeURIComponent("Only an admin can connect Zoho. Sign in as an admin.")}`);
  if (!isZohoConfigured())
    return NextResponse.redirect(`${origin}/zoho?error=${encodeURIComponent("Add ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET in Vercel first, then redeploy.")}`);
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(origin, state));
  res.cookies.set("zoho_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/zoho",
  });
  return res;
}
