import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { users } from "@/db/schema";
import { startSession, type Role } from "./auth";

/**
 * The three people who use the planner, from the Freshroots brief. Sign-in is one
 * click per role (no passwords), so reviewers can try every role without set-up.
 * Nobody can disconnect Zoho from the app (set ZOHO_ALLOW_DISCONNECT=true to allow
 * an admin to), so the integration stays live for every reviewer.
 */
export const ACCOUNTS: Record<Role, { email: string; name: string; title: string; blurb: string }> = {
  planner: {
    email: "raghav@freshroots.app",
    name: "Raghav Kulkarni",
    title: "Senior Demand Planner",
    blurb: "Upload data, re-run the rules, approve / override / reject lines and send them to Zoho.",
  },
  admin: {
    email: "deepa@freshroots.app",
    name: "Deepa Nair",
    title: "Head of Operations",
    blurb: "Everything a planner can do, plus syncing suppliers and SKUs to Zoho.",
  },
  viewer: {
    email: "procurement@freshroots.app",
    name: "Procurement",
    title: "Procurement team",
    blurb: "Read-only: see recommendations, the 90-day results and Zoho status; download the approved list.",
  },
};

export const zohoDisconnectAllowed = () => process.env.ZOHO_ALLOW_DISCONNECT === "true";

const NO_PASSWORD = "-"; // column kept from the earlier schema; passwords aren't used

export async function signInAs(db: DB, role: Role) {
  const acct = ACCOUNTS[role];
  let [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, acct.email));
  if (row) {
    await db.update(users).set({ role, active: true, name: acct.name }).where(eq(users.id, row.id));
  } else {
    [row] = await db
      .insert(users)
      .values({ email: acct.email, name: acct.name, role, passwordHash: NO_PASSWORD })
      .onConflictDoNothing()
      .returning({ id: users.id });
    row ??= (await db.select({ id: users.id }).from(users).where(eq(users.email, acct.email)))[0];
  }
  await startSession(db, row.id);
  return { name: acct.name, role };
}
