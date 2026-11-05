import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { DB } from "@/db";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

/**
 * Sign-in for the three Freshroots roles (see accounts.ts): one click, no passwords.
 *  - Sessions: random 32-byte token in an httpOnly cookie; only its SHA-256 is stored.
 *  - Roles: viewer < planner < admin. Signed-out visitors get read-only access
 *    unless REQUIRE_LOGIN_TO_VIEW=true.
 *  - Every decision and Zoho send records who made it.
 */

export const ROLES = {
  viewer: { rank: 1, label: "Viewer", can: "View dashboard, results and Zoho status" },
  planner: { rank: 2, label: "Planner", can: "Upload data, run rules, approve/override/reject, send to Zoho" },
  admin: { rank: 3, label: "Admin", can: "Everything, plus syncing suppliers and items to Zoho" },
} as const;
export type Role = keyof typeof ROLES;
export const isRole = (r: unknown): r is Role => typeof r === "string" && r in ROLES;

export const SESSION_COOKIE = "fr_session";
const SESSION_DAYS = 14;

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

/* ---------- sessions ---------- */

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

async function isHttps() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  const host = h.get("host") ?? "";
  if (proto) return proto === "https";
  return !host.startsWith("localhost") && !host.startsWith("127.0.0.1");
}

export async function startSession(db: DB, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: tokenId(token), userId, expiresAt });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  // Housekeeping: drop expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: await isHttps(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(db: DB) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Never throws (a missing table just means "nobody"). */
export async function currentUser(db?: DB): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const d = db ?? (await getDb());
    const [row] = await d
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, tokenId(token)), gt(sessions.expiresAt, new Date())));
    if (!row || !row.active || !isRole(row.role)) return null;
    return { id: row.id, name: row.name, email: row.email, role: row.role };
  } catch {
    return null;
  }
}

export const hasRole = (u: SessionUser | null, min: Role) => Boolean(u && ROLES[u.role].rank >= ROLES[min].rank);

/* ---------- guards for API routes ---------- */

/** Rejects cross-site writes: the Origin header (when sent) must match this host. */
async function sameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers / server tools
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Use at the top of a route handler:
 *   const g = await guard(req, "planner"); if (g instanceof NextResponse) return g;
 */
export async function guard(req: Request, min: Role): Promise<SessionUser | NextResponse> {
  if (!(await sameOrigin(req))) return NextResponse.json({ ok: false, error: "Cross-site request blocked." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  if (!hasRole(u, min))
    return NextResponse.json({ ok: false, error: `Your role (${ROLES[u.role].label}) can't do this. Ask an admin.` }, { status: 403 });
  return u;
}

export const loginRequiredToView = () => process.env.REQUIRE_LOGIN_TO_VIEW === "true";
