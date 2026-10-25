import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, type SkuInput } from "./rules";
import { parseCsv } from "./csv";

const read = (f: string) => readFileSync(join(__dirname, "../../data", f), "utf8");

function seedInput(isFestival = true) {
  const skus: SkuInput[] = parseCsv("sku_master", read("sku_master.csv")).map((r) => ({
    skuId: r.SKU_ID,
    name: r.SKU_Name,
    perishability: r.Perishability,
    standardReorderQty: Number(r.Standard_Reorder_Qty),
  }));
  const sales = parseCsv("weekly_sales", read("weekly_sales.csv")).map((r) => ({
    skuId: r.SKU_ID,
    week: r.Week,
    unitsSold: Number(r.Units_Sold),
  }));
  const onHand = Object.fromEntries(
    parseCsv("current_inventory", read("current_inventory.csv")).map((r) => [r.SKU_ID, Number(r.Units_On_Hand)]),
  );
  return { skus, sales, onHand, isFestival };
}

describe("rules on seed data (October = festival month)", () => {
  const out = Object.fromEntries(evaluate(seedInput()).map((r) => [r.skuId, r]));

  it("SKU001: high demand + stockout -> reorder now at 1.5x (750)", () => {
    expect(out.SKU001.flags).toEqual(["HIGH_DEMAND", "STOCKOUT_RISK"]);
    expect(out.SKU001.action).toBe("REORDER_NOW");
    expect(out.SKU001.recommendedQty).toBe(750);
    expect(out.SKU001.demandLiftPct).toBeCloseTo(21.4, 1);
    expect(out.SKU001.borderline).toMatch(/20% high-demand line/);
  });

  it("stockout risks reorder the standard qty", () => {
    expect(out.SKU003).toMatchObject({ action: "REORDER_NOW", recommendedQty: 300 });
    expect(out.SKU013).toMatchObject({ action: "REORDER_NOW", recommendedQty: 120 });
  });

  it("high-perishability SKUs use the 3-4 week window", () => {
    expect(out.SKU004).toMatchObject({ minWeeks: 3, maxWeeks: 4, action: "REORDER_NOW", recommendedQty: 150 });
    expect(out.SKU011).toMatchObject({ action: "REORDER_NOW", recommendedQty: 500 });
  });

  it("overstock pauses the next order; SKU007 is borderline", () => {
    expect(out.SKU006).toMatchObject({ action: "PAUSE", recommendedQty: 0 });
    expect(out.SKU007.action).toBe("PAUSE");
    expect(out.SKU007.weeksOfCover).toBe(4.1);
    expect(out.SKU007.borderline).toMatch(/4-week maximum/);
  });

  it("flags exactly 7 SKUs; the rest need no action", () => {
    const flagged = Object.values(out).filter((r) => r.action !== "NO_ACTION").map((r) => r.skuId);
    expect(flagged.sort()).toEqual(["SKU001", "SKU003", "SKU004", "SKU006", "SKU007", "SKU011", "SKU013"]);
  });
});

describe("edge cases", () => {
  it("festival uplift lowers weeks of cover", () => {
    const fest = evaluate(seedInput(true)).find((r) => r.skuId === "SKU002")!;
    const normal = evaluate(seedInput(false)).find((r) => r.skuId === "SKU002")!;
    expect(fest.weeksOfCover).toBeLessThan(normal.weeksOfCover);
  });

  it("thin history -> REVIEW, no quantity", () => {
    const r = evaluate({
      skus: [{ skuId: "NEW1", name: "New", perishability: "Low", standardReorderQty: 100 }],
      sales: [{ skuId: "NEW1", week: "2026-W41", unitsSold: 50 }],
      onHand: { NEW1: 10 },
      isFestival: false,
    })[0];
    expect(r).toMatchObject({ action: "REVIEW", recommendedQty: 0, needsJudgment: true });
  });

  it("high demand while overstocked -> REVIEW", () => {
    const sales = Array.from({ length: 12 }, (_, i) => ({
      skuId: "X",
      week: `2026-W${String(30 + i).padStart(2, "0")}`,
      unitsSold: i >= 8 ? 20 : 10,
    }));
    const r = evaluate({
      skus: [{ skuId: "X", name: "X", perishability: "Low", standardReorderQty: 100 }],
      sales,
      onHand: { X: 1000 },
      isFestival: false,
    })[0];
    expect(r.flags).toEqual(["HIGH_DEMAND", "OVERSTOCK_RISK"]);
    expect(r.action).toBe("REVIEW");
  });
});

describe("open purchase orders are netted off", () => {
  const base = seedInput();
  const run = (openPo: Record<string, number>) =>
    Object.fromEntries(evaluate({ ...base, openPo }).map((r) => [r.skuId, r]));

  it("partial open PO reduces the order but keeps the flags", () => {
    const out = run({ SKU001: 300 });
    expect(out.SKU001).toMatchObject({ action: "REORDER_NOW", grossQty: 750, openPoQty: 300, recommendedQty: 450 });
    expect(out.SKU001.flags).toContain("STOCKOUT_RISK");
    expect(out.SKU001.ruleSummary).toMatch(/order 450 more/);
  });

  it("open PO at or above the rule qty -> COVERED, nothing to order", () => {
    const out = run({ SKU003: 300, SKU013: 500 });
    expect(out.SKU003).toMatchObject({ action: "COVERED", grossQty: 300, recommendedQty: 0 });
    expect(out.SKU013).toMatchObject({ action: "COVERED", recommendedQty: 0 });
    expect(out.SKU003.coverWithOpenPo).toBeGreaterThan(out.SKU003.weeksOfCover);
  });

  it("open PO on an overstocked SKU adds a 'consider delaying' note", () => {
    const out = run({ SKU006: 100 });
    expect(out.SKU006.action).toBe("PAUSE");
    expect(out.SKU006.borderline).toMatch(/consider delaying/);
  });

  it("no open POs -> identical to before", () => {
    const a = evaluate(base);
    const b = evaluate({ ...base, openPo: {} });
    expect(b).toEqual(a);
    expect(a.every((r) => r.grossQty === r.recommendedQty)).toBe(true);
  });
});
