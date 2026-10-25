import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { DB } from "@/db";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

/**
 * Small, dependency-free auth for a handful of internal users.
 *  - Passwords: scrypt (N=16384, r=8, p=1) with a random 16-byte salt.
 *  - Sessions: random 32-byte token in an httpOnly cookie; only its SHA-256 is stored.
 *  - Roles: viewer < planner < admin. Signed-out visitors get read-only access
 *    unless REQUIRE_LOGIN_TO_VIEW=true.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const ROLES = {
  viewer: { rank: 1, label: "Viewer", can: "View dashboard, results and Zoho status" },
  planner: { rank: 2, label: "Planner", can: "Upload data, run rules, approve/override/reject, send to Zoho" },
  admin: { rank: 3, label: "Admin", can: "Everything, plus users and the Zoho connection" },
} as const;
export type Role = keyof typeof ROLES;
export const isRole = (r: unknown): r is Role => typeof r === "string" && r in ROLES;

export const SESSION_COOKIE = "fr_session";
const SESSION_DAYS = 14;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
export const MIN_PASSWORD = 10;

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

/* ---------- passwords ---------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const got = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return "Password is too long.";
  return null;
}

export const normEmail = (e: string) => e.trim().toLowerCase();

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
  await db.update(users).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
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

export async function userCount(db: DB) {
  try {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

/* ---------- login ---------- */

export async function login(db: DB, emailRaw: string, password: string): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  const generic = { ok: false as const, error: "Wrong email or password." };
  const [u] = await db.select().from(users).where(eq(users.email, normEmail(emailRaw)));
  if (!u) {
    await hashPassword(password); // similar timing whether or not the user exists
    return generic;
  }
  if (u.lockedUntil && u.lockedUntil.getTime() > Date.now())
    return { ok: false, error: `Too many attempts. Try again after ${u.lockedUntil.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}.` };
  if (!(await verifyPassword(password, u.passwordHash))) {
    const failed = u.failedLogins + 1;
    await db
      .update(users)
      .set({ failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, u.id));
    return generic;
  }
  if (!u.active) return { ok: false, error: "This account is deactivated. Ask an admin." };
  if (!isRole(u.role)) return generic;
  await startSession(db, u.id);
  return { ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } };
}

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
