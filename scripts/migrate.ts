import "dotenv/config";
import { closeDb, getDb } from "../src/db";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    // Lets the first Vercel build succeed before the database is connected.
    console.log("DATABASE_URL not set: skipping migrations");
    process.exit(0);
  }
  const db = await getDb();
  if (url.startsWith("pglite:")) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: "drizzle" });
  } else {
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(db as never, { migrationsFolder: "drizzle" });
  }
  console.log("Migrations applied");
  await closeDb();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
