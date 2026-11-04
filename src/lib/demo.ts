import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { users } from "@/db/schema";
import { startSession, type Role } from "./auth";

/**
 * Demo mode (default ON): reviewers sign in with one click as any role, no passwords.
 * Demo accounts can't log in with a password, can't be changed, and in demo mode
 * nobody can disconnect Zoho, so the integration stays live for every reviewer.
 * Set DEMO_MODE=false to turn it off for real use.
 */
export const demoMode = () => process.env.DEMO_MODE !== "false";

export const DEMO_ACCOUNTS: Record<Role, { email: string; name: string; title: string; blurb: string }> = {
  planner: {
    email: "raghav@demo.freshroots",
    name: "Raghav Kulkarni",
    title: "Senior Demand Planner",
    blurb: "Upload data, re-run the rules, approve / override / reject lines and send them to Zoho.",
  },
  admin: {
    email: "deepa@demo.freshroots",
    name: "Deepa Nair",
    title: "Head of Operations",
    blurb: "Everything a planner can do, plus the Users page and syncing suppliers to Zoho.",
  },
  viewer: {
    email: "procurement@demo.freshroots",
    name: "Procurement",
    title: "Procurement team",
    blurb: "Read-only: see recommendations, the 90-day results and Zoho status; download the approved list.",
  },
};

export const isDemoEmail = (email: string) => email.endsWith("@demo.freshroots");

/** Not a valid scrypt hash, so password sign-in is impossible for demo accounts. */
const NO_PASSWORD = "demo$no-password";

export async function demoSignIn(db: DB, role: Role) {
  const acct = DEMO_ACCOUNTS[role];
  const [existing] = await db.select().from(users).where(eq(users.email, acct.email));
  let id: number;
  if (existing) {
    id = existing.id;
    // Self-heal if anything drifted.
    await db.update(users).set({ role, active: true, name: acct.name, passwordHash: NO_PASSWORD }).where(eq(users.id, id));
  } else {
    const [u] = await db
      .insert(users)
      .values({ email: acct.email, name: acct.name, role, passwordHash: NO_PASSWORD })
      .onConflictDoNothing()
      .returning({ id: users.id });
    id = u?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, acct.email)))[0].id;
  }
  await startSession(db, id);
  return { name: acct.name, role };
}
