import { asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { decisions, recommendations, runs } from "@/db/schema";
import { getConnection } from "./zoho/client";

export type TickerItem = { label: string; value: string; tone?: "alert" | "good" | "muted" };

const fmt = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/** The handful of facts a planner needs at a glance, from the latest run. Never throws. */
export async function tickerItems(db: DB): Promise<TickerItem[]> {
  try {
    const [run] = await db.select().from(runs).orderBy(desc(runs.id)).limit(1);
    if (!run) return [{ label: "Status", value: "No runs yet: load data to start", tone: "muted" }];
    const [first] = await db.select({ createdAt: runs.createdAt }).from(runs).orderBy(asc(runs.id)).limit(1);
    const recs = await db
      .select({ id: recommendations.id, action: recommendations.action })
      .from(recommendations)
      .where(eq(recommendations.runId, run.id));
    const flagged = recs.filter((r) => r.action !== "NO_ACTION");
    const decided = flagged.length
      ? (await db.select({ id: decisions.recommendationId }).from(decisions).where(inArray(decisions.recommendationId, flagged.map((r) => r.id)))).length
      : 0;
    const count = (a: string) => recs.filter((r) => r.action === a).length;
    const zoho = await getConnection(db).catch(() => null);
    const day = Math.min(90, Math.floor((Date.now() - first.createdAt.getTime()) / 86_400_000) + 1);

    const items: TickerItem[] = [
      { label: `Run #${run.id}`, value: fmt(run.createdAt) },
      { label: "Stock as of", value: fmtDay(String(run.asOfDate)) },
      { label: "Reorder now", value: String(count("REORDER_NOW") + count("REORDER")), tone: count("REORDER_NOW") ? "alert" : undefined },
      { label: "Covered by open POs", value: String(count("COVERED")), tone: "good" },
      { label: "Pause", value: String(count("PAUSE")) },
      { label: "Awaiting decision", value: `${flagged.length - decided} of ${flagged.length}`, tone: flagged.length - decided ? "alert" : "good" },
    ];
    if (run.isFestival) items.push({ label: "Festival month", value: "+25% demand" });
    items.push({ label: "Zoho", value: zoho ? "connected" : "not connected", tone: zoho ? "good" : "muted" });
    items.push({ label: "Pilot", value: `day ${day} of 90` });
    return items;
  } catch {
    return [];
  }
}
