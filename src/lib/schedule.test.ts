import { describe, it, expect } from "vitest";
import { nextScheduledRun } from "./schedule";

const iso = (d: Date) => d.toISOString();
describe("next scheduled run (Mon & Thu 6:00 am IST = 00:30 UTC)", () => {
  it("Wednesday -> Thursday 6 am IST", () => {
    expect(iso(nextScheduledRun(new Date("2026-11-04T10:00:00Z")))).toBe("2026-11-05T00:30:00.000Z");
  });
  it("Thursday 7 am IST (just after) -> next Monday", () => {
    expect(iso(nextScheduledRun(new Date("2026-11-05T01:30:00Z")))).toBe("2026-11-09T00:30:00.000Z");
  });
  it("Monday 5:59 am IST -> same morning", () => {
    expect(iso(nextScheduledRun(new Date("2026-11-09T00:29:00Z")))).toBe("2026-11-09T00:30:00.000Z");
  });
});
