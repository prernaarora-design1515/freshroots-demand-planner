import "dotenv/config";
import { readFileSync } from "node:fs";
import { closeDb, getDb } from "../src/db";
import { ingest } from "../src/lib/ingest";
import { createRun } from "../src/lib/runs";

const f = (n: string) => readFileSync(`data/${n}.csv`, "utf8");

async function main() {
  const db = await getDb();
  const counts = await ingest(db, {
    distributor_master: f("distributor_master"),
    sku_master: f("sku_master"),
    weekly_sales: f("weekly_sales"),
    current_inventory: f("current_inventory"),
    calendar: f("calendar"),
  });
  console.log("Loaded:", counts);
  const run = await createRun(db);
  console.log(`Run #${run.id}: ${run.flaggedCount}/${run.skuCount} SKUs flagged, festival=${run.isFestival}, AI=${run.aiStatus}`);
  await closeDb();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
