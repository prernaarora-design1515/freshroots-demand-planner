import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword, isRole, MIN_PASSWORD, normEmail, passwordProblem, userCount, verifyPassword, type Role } from "./auth";

const email = z.string().trim().email("Enter a valid email").max(200);
const name = z.string().trim().min(1, "Name is required").max(80);
const password = z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(200);
const role = z.enum(["admin", "planner", "viewer"]);

export const newUserInput = z.object({ name, email, role, password });
export const updateUserInput = z.object({
  id: z.number().int().positive(),
  role: role.optional(),
  active: z.boolean().optional(),
  password: password.optional(),
  name: name.optional(),
});
export const setupInput = z.object({ code: z.string().min(1, "Setup code is required"), name, email, password });

export async function listUsers(db: DB) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .orderBy(asc(users.id));
}

export async function createUser(db: DB, input: z.infer<typeof newUserInput>) {
  const e = normEmail(input.email);
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, e));
  if (exists) throw new Error("A user with this email already exists.");
  const [u] = await db
    .insert(users)
    .values({ name: input.name, email: e, role: input.role, passwordHash: await hashPassword(input.password) })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  return u;
}

async function activeAdmins(db: DB, excludeId?: number) {
  const where = excludeId
    ? and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, excludeId))
    : and(eq(users.role, "admin"), eq(users.active, true));
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
  return Number(r?.n ?? 0);
}

export async function updateUser(db: DB, actorId: number, input: z.infer<typeof updateUserInput>) {
  const [u] = await db.select().from(users).where(eq(users.id, input.id));
  if (!u) throw new Error("User not found.");
  const losingAdmin = u.role === "admin" && ((input.role && input.role !== "admin") || input.active === false);
  if (losingAdmin && (await activeAdmins(db, u.id)) === 0) throw new Error("There must always be at least one active admin.");
  if (input.id === actorId && input.active === false) throw new Error("You can't deactivate yourself.");

  const set: Partial<typeof users.$inferInsert> = {};
  if (input.role) set.role = input.role;
  if (input.name) set.name = input.name;
  if (input.active !== undefined) set.active = input.active;
  if (input.password) {
    set.passwordHash = await hashPassword(input.password);
    set.failedLogins = 0;
    set.lockedUntil = null;
  }
  if (!Object.keys(set).length) return;
  await db.update(users).set(set).where(eq(users.id, input.id));
  // Role changes, deactivation and password resets sign the user out everywhere.
  if (input.role || input.active === false || input.password) await db.delete(sessions).where(eq(sessions.userId, input.id));
}

export async function changeOwnPassword(db: DB, userId: number, current: string, next: string) {
  const problem = passwordProblem(next);
  if (problem) throw new Error(problem);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw new Error("Current password is wrong.");
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
}

/**
 * First-run setup: creates the first admin. Only works while there are no users,
 * and only with the SETUP_CODE set by the project owner in Vercel.
 */
export function setupCodeConfigured() {
  return Boolean(process.env.SETUP_CODE && process.env.SETUP_CODE.length >= 8);
}

export async function setupFirstAdmin(db: DB, input: z.infer<typeof setupInput>) {
  if (!setupCodeConfigured()) throw new Error("Setup is not enabled: add SETUP_CODE (8+ characters) in Vercel and redeploy.");
  const a = Buffer.from(input.code);
  const b = Buffer.from(process.env.SETUP_CODE!);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Setup code is wrong.");
  if ((await userCount(db)) > 0) throw new Error("Setup is already done. Sign in instead.");
  return createUser(db, { ...input, role: "admin" as Role });
}

export { isRole };
