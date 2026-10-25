import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: DB | null = null;
let closer: (() => Promise<void>) | null = null;

/**
 * Production: Neon over HTTP (DATABASE_URL=postgres://...neon.tech/...).
 * Local dev / tests without Neon: DATABASE_URL=pglite:./.pglite runs an embedded Postgres.
 */
export async function getDb(): Promise<DB> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = url.slice("pglite:".length) || undefined;
    const client = new PGlite(dir);
    closer = () => client.close();
    cached = drizzle(client, { schema }) as unknown as DB;
  } else {
    cached = drizzleNeon(neon(url), { schema }) as unknown as DB;
  }
  return cached;
}

/** Only needed for scripts using PGlite, so the embedded database shuts down cleanly. */
export async function closeDb() {
  if (closer) await closer();
  cached = null;
  closer = null;
}

export { schema };
