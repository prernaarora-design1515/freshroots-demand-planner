/**
 * The planning cadence: rules run automatically every Monday and Thursday at 6:00 am IST
 * (Vercel Cron, vercel.json "30 0 * * 1,4" in UTC). Planners can still re-run any time.
 */
export const SCHEDULE = { days: [1, 4], hourIst: 6, label: "Mon & Thu, 6:00 am IST" } as const;
export const CRON_EXPR = "30 0 * * 1,4";

const IST_MS = 5.5 * 3_600_000;

/** Next scheduled run after `now`. */
export function nextScheduledRun(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_MS); // wall-clock IST in UTC fields
  for (let add = 0; add <= 7; add++) {
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + add, SCHEDULE.hourIst, 0, 0));
    const day = d.getUTCDay();
    const utc = new Date(d.getTime() - IST_MS);
    if ((SCHEDULE.days as readonly number[]).includes(day) && utc.getTime() > now.getTime()) return utc;
  }
  throw new Error("unreachable");
}

export const fmtIst = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
